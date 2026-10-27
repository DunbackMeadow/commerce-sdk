import { describe, expect, it, vi } from "vitest";
import {
  DunbackClient, DunbackApiError, verifyWebhook, signWebhookPayload, DEFAULT_BASE_URL, SANDBOX_BASE_URL,
  toDunbackAttendees, guestsWithUnsharedAllergies, buildCateringRequest, canOrderFood, DUNBACK_REGISTRATION_QUESTION, payOrderWithX402,
  toVenueLocation,
} from "../src/index.js";

const event = {
  api_id: "evt-AbC123",
  name: "Founders Dinner",
  start_at: "2026-11-14T02:00:00Z",
  timezone: "America/Los_Angeles",
  geo_address_json: { address: "100 University Ave", city: "Palo Alto", region: "CA", postal_code: "94301", country_code: "us" },
};
const guests = [
  { guest: { api_id: "g1", user_name: "Ana", user_email: "ana@x.com", approval_status: "approved", registration_answers: [{ question_id: DUNBACK_REGISTRATION_QUESTION.id, answer: "peanuts" }] } },
  { guest: { api_id: "g2", user_name: "Ben", user_email: "ben@x.com", approval_status: "declined", registration_answers: [] } },
  { api_id: "g3", name: "Cleo", phone_number: "+15551234567", approval_status: "approved", registration_answers: [{ label: "Dietary restrictions?", answer: ["vegetarian", "no dairy"] }] },
];

describe("luma helpers", () => {
  it("maps attending guests and their allergy answers", () => {
    const a = toDunbackAttendees(guests);
    expect(a).toEqual([
      { externalId: "g1", name: "Ana", allergies: "peanuts", allergyConsent: true, email: "ana@x.com" },
      // Cleo answered the host's own question, which has no consent wording.
      { externalId: "g3", name: "Cleo", allergies: "", phone: "+15551234567" },
    ]);
    expect(guestsWithUnsharedAllergies(guests)).toEqual(["Cleo"]);
  });

  it("sends answers to the host's own question when it has consent wording", () => {
    const a = toDunbackAttendees(guests, { otherQuestionsHaveConsent: true });
    expect(a[1]).toMatchObject({ name: "Cleo", allergies: "vegetarian, no dairy", allergyConsent: true });
    expect(guestsWithUnsharedAllergies(guests, { otherQuestionsHaveConsent: true })).toEqual([]);
  });

  it("does not flag 'none' answers", () => {
    const g = [{ api_id: "g9", name: "Dee", registration_answers: [{ question_id: DUNBACK_REGISTRATION_QUESTION.id, answer: "none" }] }];
    expect(toDunbackAttendees(g)[0]).toEqual({ externalId: "g9", name: "Dee", allergies: "" });
  });

  it("builds a catering request", () => {
    const r = buildCateringRequest({
      event, guests,
      settings: { enabled: true, cuisine: "mexican" },
      host: { name: "Sam", email: "sam@x.com", phone: "+15550000000" },
    });
    expect(r.partnerReference).toBe("luma:evt-AbC123");
    expect(r.deliveryAddress).toMatchObject({ address1: "100 University Ave", zip: "94301", country: "US" });
    expect(r.onsiteContact.phone).toBe("+15550000000");
    expect(r.attendees).toHaveLength(2);
    expect(r.serviceStyle).toBe("meal_boxes");
    expect(buildCateringRequest({ event, guests, settings: { enabled: true, cuisine: "mexican", serviceStyle: "buffet" }, host: { name: "Sam", email: "sam@x.com", phone: "+15550000000" } }).serviceStyle).toBe("buffet");
  });

  it("refuses online events and missing on-site phone", () => {
    expect(() => buildCateringRequest({ event: { ...event, geo_address_json: null }, guests, settings: { enabled: true, cuisine: "thai" }, host: { name: "S", email: "s@x.com", phone: "1" } })).toThrow(/street address/);
    expect(() => buildCateringRequest({ event, guests, settings: { enabled: true, cuisine: "thai" }, host: { name: "S", email: "s@x.com" } })).toThrow(/on-site contact/);
  });

  it("offers Order Food only after the guest list deadline", () => {
    const s = { enabled: true, cuisine: "thai" as const, guestListDeadline: "2026-11-10T00:00:00Z" };
    expect(canOrderFood(s, event, new Date("2026-11-09T00:00:00Z")).ok).toBe(false);
    expect(canOrderFood(s, event, new Date("2026-11-11T00:00:00Z")).ok).toBe(true);
    expect(canOrderFood(s, event, new Date("2026-11-15T00:00:00Z")).ok).toBe(false);
  });
});

describe("webhooks", () => {
  it("verifies a signed payload and rejects tampering/replays", () => {
    const body = JSON.stringify({ id: "evt_1", type: "order.confirmed", created: 1, data: {} });
    const sig = signWebhookPayload(body, "whsec_test");
    expect(verifyWebhook(body, sig, "whsec_test").type).toBe("order.confirmed");
    expect(() => verifyWebhook(body + " ", sig, "whsec_test")).toThrow(/Invalid/);
    expect(() => verifyWebhook(body, sig, "whsec_test", { now: Date.now() + 3600_000 })).toThrow(/tolerance/);
  });
});

describe("client", () => {
  it("sends auth + idempotency headers and surfaces API errors", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ error: { code: "order_deadline_passed", message: "Too late" } }), { status: 409 });
    });
    const c = new DunbackClient({ apiKey: "dbk_test_luma_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", baseUrl: "https://example.test/v1", fetch: fetchMock as unknown as typeof fetch });
    const err = await c.catering.select("creq_1", { optionId: "opt_1" }).catch((e) => e);
    expect(err).toBeInstanceOf(DunbackApiError);
    expect(err.code).toBe("order_deadline_passed");
    const h = calls[0].init.headers as Record<string, string>;
    expect(calls[0].url).toBe("https://example.test/v1/catering/requests/creq_1/select");
    expect(h.Authorization).toMatch(/^Bearer dbk_test_/);
    expect(h["Idempotency-Key"]).toBeTruthy();
  });

  it("corrects an order's delivery details", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return calls.length === 1
        ? new Response(JSON.stringify({ id: "ord_1", object: "order", status: "AWAITING_PAYMENT", delivery: { deliveryNotes: "Gate 4", editable: true } }), { status: 200 })
        : new Response(JSON.stringify({ error: { code: "address_moved", message: "Too far from the quoted address" } }), { status: 422 });
    });
    const c = new DunbackClient({ apiKey: "dbk_test_luma_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", baseUrl: "https://example.test/v1", fetch: fetchMock as unknown as typeof fetch });
    const input = { deliveryAddress: { address1: "120 University Ave", city: "Palo Alto", state: "CA", zip: "94301" }, deliveryNotes: "Gate 4" };
    const o = await c.orders.updateDelivery("ord_1", input);
    expect(calls[0].url).toBe("https://example.test/v1/orders/ord_1/delivery");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual(input);
    expect(o.delivery.deliveryNotes).toBe("Gate 4");
    const err = await c.orders.updateDelivery("ord_1", input).catch((e) => e);
    expect(err).toBeInstanceOf(DunbackApiError);
    expect(err.code).toBe("address_moved");
  });

  it("counts cuisines near a venue", async () => {
    const urls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(url.includes("?")
        ? { object: "list", data: [{ id: "mexican", label: "Mexican", restaurants: 2 }], scope: "metro", metro: { id: "sf-bay-area", name: "San Francisco Bay Area" } }
        : { object: "list", data: [{ id: "mexican", label: "Mexican", restaurants: 9 }] }), { status: 200 });
    });
    const c = new DunbackClient({ apiKey: "dbk_test_luma_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", baseUrl: "https://example.test/v1", fetch: fetchMock as unknown as typeof fetch });
    const venue = toVenueLocation(event.geo_address_json);
    expect(venue).toEqual({ city: "Palo Alto", state: "CA", zip: "94301" });
    const near = await c.cuisineCatalog(venue);
    expect(urls[0]).toBe("https://example.test/v1/catalog/cuisines?city=Palo+Alto&state=CA&zip=94301");
    expect(near).toMatchObject({ scope: "metro", metro: { name: "San Francisco Bay Area" } });
    expect(await c.listCuisines()).toEqual([{ id: "mexican", label: "Mexican", restaurants: 9 }]);
    expect(urls[1]).toBe("https://example.test/v1/catalog/cuisines");
    // No street address / ZIP yet, or an online event: no venue.
    expect(toVenueLocation({ city: "Palo Alto", region: "CA" })).toBeNull();
    expect(toVenueLocation(null)).toBeNull();
  });

  it("counts only restaurants that cater the expected guests", async () => {
    const urls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "thai", label: "Thai", restaurants: 1 }], scope: "metro", metro: { id: "sf-bay-area", name: "San Francisco Bay Area" }, guests: 120 }), { status: 200 });
    });
    const c = new DunbackClient({ apiKey: "dbk_test_luma_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", baseUrl: "https://example.test/v1", fetch: fetchMock as unknown as typeof fetch });
    const catalog = await c.cuisineCatalog({ zip: "94301" }, { guests: 120 });
    expect(urls[0]).toBe("https://example.test/v1/catalog/cuisines?zip=94301&guests=120");
    expect(catalog).toMatchObject({ scope: "metro", guests: 120 });
    await c.listCuisines(null, { guests: 8 });
    expect(urls[1]).toBe("https://example.test/v1/catalog/cuisines?guests=8");
    await expect(c.listCuisines(null, { guests: 2.5 })).rejects.toThrow(TypeError);
    expect(urls).toHaveLength(2);
    await c.cuisineCatalog({ zip: "94301" }, { guests: 40, serviceStyle: "buffet" });
    expect(urls[2]).toBe("https://example.test/v1/catalog/cuisines?zip=94301&guests=40&serviceStyle=buffet");
  });

  const secret = "x".repeat(43);

  it("picks the environment from the key", () => {
    const test = new DunbackClient({ apiKey: `dbk_test_app-k3m9x2q7w4ze_${secret}`, fetch: vi.fn() as unknown as typeof fetch });
    expect(test.mode).toBe("test");
    expect(test.appId).toBe("app-k3m9x2q7w4ze");
    const live = new DunbackClient({ apiKey: `dbk_live_luma_${secret}`, fetch: vi.fn() as unknown as typeof fetch });
    expect(live.mode).toBe("live");
    expect(live.appId).toBe("luma");
  });

  it("defaults to the sandbox for test keys and production for live keys", async () => {
    const urls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ object: "app", id: "app-k3m9x2q7w4ze", name: "Demo", mode: "test", webhookUrl: null, allowedReturnHosts: [] }), { status: 200 });
    });
    const f = fetchMock as unknown as typeof fetch;
    const me = await new DunbackClient({ apiKey: `dbk_test_app-k3m9x2q7w4ze_${secret}`, fetch: f }).me();
    await new DunbackClient({ apiKey: `dbk_live_app-k3m9x2q7w4ze_${secret}`, fetch: f }).me();
    expect(urls).toEqual([`${SANDBOX_BASE_URL}/me`, `${DEFAULT_BASE_URL}/me`]);
    expect(me.mode).toBe("test");
  });

  it("rejects malformed keys", () => {
    expect(() => new DunbackClient({ apiKey: "sk_test_123" })).toThrow(/dbk_live_/);
    expect(() => new DunbackClient({ apiKey: "dbk_test_app_short" })).toThrow(/Developer Dashboard/);
  });
});

describe("x402", () => {
  it("answers the 402 challenge with a signed EIP-3009 authorization", async () => {
    const accept = { scheme: "exact", network: "eip155:137", amount: "412380000", asset: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", payTo: "0x1111111111111111111111111111111111111111", maxTimeoutSeconds: 300, extra: { name: "USD Coin", version: "2" } };
    let sent: any = null;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const sig = (init.headers as Record<string, string> | undefined)?.["PAYMENT-SIGNATURE"];
      if (!sig) return new Response(JSON.stringify({ accepts: [accept] }), { status: 402, headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify({ accepts: [accept] })) } });
      sent = JSON.parse(atob(sig));
      return new Response(JSON.stringify({ id: "ord_1", status: "CONFIRMED" }), { status: 200 });
    });
    const signTypedData = vi.fn(async () => "0xsig");
    const order = await payOrderWithX402(
      { id: "ord_1", payment: { usdc: { x402Url: "https://example.test/x402?t=abc" } } as any },
      { address: "0x2222222222222222222222222222222222222222", signTypedData },
      { fetch: fetchMock as unknown as typeof fetch },
    );
    expect(order.status).toBe("CONFIRMED");
    expect(sent.payload.authorization).toMatchObject({ to: accept.payTo, value: "412380000", from: "0x2222222222222222222222222222222222222222" });
    expect(sent.payload.signature).toBe("0xsig");
    await expect(payOrderWithX402({ id: "ord_1", payment: { usdc: { x402Url: "https://example.test/x" } } as any }, { address: "0x2", signTypedData }, { fetch: fetchMock as unknown as typeof fetch, maxAmountUsdc: 100 })).rejects.toThrow(/above your limit/);
  });
});
