/**
 * Reference integration: what Luma's backend adds to support
 * "Food & drinks by Dunback Meadow". Express for brevity; the `db` and
 * `luma` objects stand in for Luma's own data layer and API.
 *
 *   DUNBACK_API_KEY=dbk_test_luma_... DUNBACK_WEBHOOK_SECRET=whsec_... npx tsx server.ts
 */

import express from "express";
import {
  DunbackClient, DunbackApiError, verifyWebhook, buildCateringRequest, canOrderFood,
  DUNBACK_REGISTRATION_QUESTION, type DunbackEventSettings, type WebhookEvent, type Order, type CateringRequest,
} from "@dunbackmeadow/commerce-sdk";

const dunback = new DunbackClient({ apiKey: process.env.DUNBACK_API_KEY!, baseUrl: process.env.DUNBACK_BASE_URL });
const app = express();

// ---- stand-ins for Luma internals -----------------------------------------
const db = {
  settings: new Map<string, DunbackEventSettings>(),          // eventId -> settings
  cateringRequest: new Map<string, string>(),                 // eventId -> Dunback request id
  order: new Map<string, string>(),                           // eventId -> Dunback order id
};
const luma = {
  async getEvent(eventId: string) { return { api_id: eventId, name: "Founders Dinner", start_at: "2026-11-14T02:00:00Z", timezone: "America/Los_Angeles", geo_address_json: { address: "100 University Ave", city: "Palo Alto", region: "CA", postal_code: "94301", country_code: "US" } }; },
  async getGuests(_eventId: string) { return [] as any[]; },
  async getHost(_eventId: string) { return { name: "Sam Host", email: "sam@example.com", phone: "+14155550100" }; },
  async addRegistrationQuestion(_eventId: string, _q: typeof DUNBACK_REGISTRATION_QUESTION) {},
  async notifyHost(_eventId: string, _message: string, _link?: string) {},
  requireHost: (_req: express.Request, _eventId: string) => true,
};

// Dunback errors -> HTTP answers your UI can show as-is.
function fail(res: express.Response, e: unknown) {
  if (e instanceof DunbackApiError) return res.status(e.status >= 400 && e.status < 600 ? e.status : 502).json({ code: e.code, message: e.message });
  console.error(e);
  return res.status(500).json({ code: "internal_error", message: "Something went wrong." });
}

// Webhooks need the raw body for the signature, so mount this BEFORE express.json().
app.post("/webhooks/dunback", express.raw({ type: "application/json" }), async (req, res) => {
  let event: WebhookEvent;
  try {
    event = verifyWebhook(req.body, req.header("Dunback-Signature"), process.env.DUNBACK_WEBHOOK_SECRET!);
  } catch {
    return res.sendStatus(400);
  }
  const eventId = String((event.data as Order | CateringRequest).partnerReference || "").replace(/^luma:/, "");
  switch (event.type) {
    case "catering.options_ready":
      await luma.notifyHost(eventId, "Your Dunback catering options are ready to review.");
      break;
    case "catering.no_options":
      await luma.notifyHost(eventId, "No restaurant on Dunback can cater this event at that time and place.");
      break;
    case "order.confirmed":
      await luma.notifyHost(eventId, `Catering confirmed: ${(event.data as Order).summary}`);
      break;
    case "order.payment_failed":
    case "order.expired":
    case "order.failed":
      await luma.notifyHost(eventId, `Catering order issue: ${(event.data as Order).error?.message || (event.data as Order).payment.lastError?.message || event.type}`);
      break;
  }
  res.sendStatus(200); // answer fast; Dunback retries non-2xx a few times
});

app.use(express.json());

// 1. Event creation: cuisines for the picker, then save the host's choice.
app.get("/api/dunback/cuisines", async (_req, res) => {
  try { res.json(await dunback.listCuisines()); } catch (e) { fail(res, e); }
});

app.put("/api/events/:eventId/dunback", async (req, res) => {
  const settings = req.body as DunbackEventSettings | null;
  if (settings?.enabled) {
    db.settings.set(req.params.eventId, settings);
    // 2. Registration: guests get the allergy question.
    await luma.addRegistrationQuestion(req.params.eventId, DUNBACK_REGISTRATION_QUESTION);
  } else {
    db.settings.delete(req.params.eventId);
  }
  res.json({ ok: true });
});

// 3. Host's event page: show the button?
app.get("/api/events/:eventId/dunback", async (req, res) => {
  const event = await luma.getEvent(req.params.eventId);
  const settings = db.settings.get(req.params.eventId) || null;
  const requestId = db.cateringRequest.get(req.params.eventId);
  const orderId = db.order.get(req.params.eventId);
  try {
    res.json({
      settings,
      canOrder: canOrderFood(settings, event),
      request: requestId ? await dunback.catering.get(requestId) : null,
      order: orderId ? await dunback.orders.get(orderId) : null,
    });
  } catch (e) { fail(res, e); }
});

// "Order Food via Dunback Meadow"
app.post("/api/events/:eventId/dunback/order-food", async (req, res) => {
  const { eventId } = req.params;
  if (!luma.requireHost(req, eventId)) return res.sendStatus(403);
  const settings = db.settings.get(eventId);
  const event = await luma.getEvent(eventId);
  const gate = canOrderFood(settings, event);
  if (!gate.ok) return res.status(409).json({ code: "not_available", message: gate.reason });
  try {
    const input = buildCateringRequest({ event, guests: await luma.getGuests(eventId), settings: settings!, host: await luma.getHost(eventId) });
    // Same key for retries of the same click, so a double-click doesn't create two requests.
    const request = await dunback.catering.create(input, { idempotencyKey: `luma-${eventId}-${input.attendees.length}-${req.body?.clickId || ""}` });
    db.cateringRequest.set(eventId, request.id);
    res.status(202).json(request); // UI polls GET /api/events/:eventId/dunback until status != COMPOSING
  } catch (e) { fail(res, e); }
});

// Host picks one of the three options -> payment links.
app.post("/api/events/:eventId/dunback/select", async (req, res) => {
  const { eventId } = req.params;
  if (!luma.requireHost(req, eventId)) return res.sendStatus(403);
  const requestId = db.cateringRequest.get(eventId);
  if (!requestId) return res.status(404).json({ code: "not_found", message: "Order food first." });
  try {
    const host = await luma.getHost(eventId);
    const order = await dunback.catering.select(requestId, {
      optionId: String(req.body.optionId),
      payer: { name: host.name, email: host.email },
      successUrl: `https://lu.ma/event/manage/${eventId}?dunback=paid`,
      cancelUrl: `https://lu.ma/event/manage/${eventId}?dunback=cancelled`,
    });
    db.order.set(eventId, order.id);
    // order.payment.stripe.checkoutUrl -> "Pay by card"; order.payment.hostedPaymentUrl -> "Pay with USDC"
    res.status(201).json(order);
  } catch (e) { fail(res, e); }
});

app.post("/api/events/:eventId/dunback/cancel", async (req, res) => {
  const orderId = db.order.get(req.params.eventId);
  if (!orderId) return res.status(404).json({ code: "not_found", message: "No Dunback order for this event." });
  try { res.json(await dunback.orders.cancel(orderId, "Cancelled by the host")); } catch (e) { fail(res, e); }
});

app.listen(4000, () => console.log("Luma x Dunback example on http://localhost:4000"));
