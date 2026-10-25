import { DunbackApiError } from "./errors.js";
import type {
  AppInfo, CateringRequest, CateringRequestInput, Cuisine, Order, SelectOptionInput, UpdateDeliveryInput,
} from "./types.js";

export interface DunbackClientOptions {
  /**
   * `dbk_test_<appId>_...` (sandbox) or `dbk_live_<appId>_...` (production), from
   * the Developer Dashboard (https://dunbackmeadow.com/developer).
   * Server-side only: never ship it to a browser.
   */
  apiKey: string;
  /** Default: the sandbox for a `dbk_test_` key, production for a `dbk_live_` key. */
  baseUrl?: string;
  /** Per-request timeout, ms. Default 30 000. */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export const DEFAULT_BASE_URL = "https://dunbackmeadow.com/api/partner/v1";
export const SANDBOX_BASE_URL = "https://sandbox.dunbackmeadow.com/api/partner/v1";

const KEY_RE = /^dbk_(live|test)_([a-z0-9-]{2,40})_[A-Za-z0-9_-]{32,}$/;

function randomKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Server-side client for the Dunback Meadow Partner API.
 *
 *   const dunback = new DunbackClient({ apiKey: process.env.DUNBACK_API_KEY! });
 *   await dunback.me();   // which app and environment the key belongs to
 *   const req = await dunback.catering.create({...});
 *   const ready = await dunback.catering.waitForOptions(req.id);
 *   const order = await dunback.catering.select(ready.id, { optionId: ready.options[0].id });
 *   // send order.payment.hostedPaymentUrl (or the Stripe / USDC links) to the payer
 */
export class DunbackClient {
  /** "test" (sandbox) or "live" (production), from the key. */
  readonly mode: "live" | "test";
  /** The app the key belongs to, from the key. */
  readonly appId: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: DunbackClientOptions) {
    const parsed = KEY_RE.exec(String(opts?.apiKey || "").trim());
    if (!parsed) throw new Error("DunbackClient: a dbk_live_/dbk_test_ API key is required. Create one in the Dunback Developer Dashboard.");
    this.apiKey = parsed[0];
    this.mode = parsed[1] as "live" | "test";
    this.appId = parsed[2];
    this.baseUrl = (opts.baseUrl || (this.mode === "test" ? SANDBOX_BASE_URL : DEFAULT_BASE_URL)).replace(/\/$/, "");
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    if (!this.fetchImpl) throw new Error("DunbackClient: global fetch is missing (Node 18+ required).");
  }

  /** Low-level request. Retries network errors and 5xx (POSTs only with an Idempotency-Key). */
  async request<T>(method: "GET" | "POST", path: string, body?: unknown, opts: { idempotencyKey?: string; timeoutMs?: number } = {}): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
    const retriable = method === "GET" || !!opts.idempotencyKey;

    for (let attempt = 0; ; attempt += 1) {
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(opts.timeoutMs ?? this.timeoutMs),
        });
      } catch (e) {
        if (retriable && attempt < 2) { await sleep(500 * 2 ** attempt); continue; }
        throw new DunbackApiError(0, "network_error", (e as Error).message);
      }
      const text = await res.text();
      let json: any = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
      if (res.ok) return json as T;
      if (retriable && res.status >= 500 && attempt < 2) { await sleep(500 * 2 ** attempt); continue; }
      const err = json?.error || {};
      throw new DunbackApiError(res.status, err.code || `http_${res.status}`, err.message || text || res.statusText, err.details);
    }
  }

  /** The app and environment this key belongs to. Handy as a "is my key working?" check. */
  async me(): Promise<AppInfo> {
    return this.request<AppInfo>("GET", "/me");
  }

  /** Cuisines a host can pick when creating an event. */
  async listCuisines(): Promise<Cuisine[]> {
    const r = await this.request<{ data: Cuisine[] }>("GET", "/catalog/cuisines");
    return r.data;
  }

  readonly catering = {
    /** Sends the guest list; Dunback's catering agent composes up to 3 priced options (async). */
    create: (input: CateringRequestInput, opts: { idempotencyKey?: string } = {}) =>
      this.request<CateringRequest>("POST", "/catering/requests", input, { idempotencyKey: opts.idempotencyKey ?? randomKey() }),

    get: (requestId: string) => this.request<CateringRequest>("GET", `/catering/requests/${encodeURIComponent(requestId)}`),

    /** All catering requests made under one partnerReference (e.g. one Luma event), newest first. */
    listByReference: async (partnerReference: string) =>
      (await this.request<{ data: CateringRequest[] }>("GET", `/catering/requests?partnerReference=${encodeURIComponent(partnerReference)}`)).data,

    /**
     * Polls until composing is done (usually 5-30 s). Prefer the
     * `catering.options_ready` webhook in production; this is for scripts and agents.
     */
    waitForOptions: async (requestId: string, { timeoutMs = 120_000, intervalMs = 2_500 } = {}) => {
      const until = Date.now() + timeoutMs;
      for (;;) {
        const r = await this.catering.get(requestId);
        if (r.status !== "COMPOSING") return r;
        if (Date.now() > until) throw new DunbackApiError(408, "timeout", "Dunback is still composing options; try again shortly.");
        await sleep(intervalMs);
      }
    },

    /** The host picks an option: creates the order and its payment links. */
    select: (requestId: string, input: SelectOptionInput, opts: { idempotencyKey?: string } = {}) =>
      this.request<Order>("POST", `/catering/requests/${encodeURIComponent(requestId)}/select`, input, { idempotencyKey: opts.idempotencyKey ?? randomKey(), timeoutMs: 60_000 }),
  };

  readonly orders = {
    /** Current state; also re-checks Stripe, so it is safe to poll after a checkout redirect. */
    get: (orderId: string) => this.request<Order>("GET", `/orders/${encodeURIComponent(orderId)}`),

    /** Tell Dunback about a USDC transfer (optional: transfers of the exact amount are detected automatically). */
    confirmUsdcPayment: (orderId: string, txHash: string) =>
      this.request<Order>("POST", `/orders/${encodeURIComponent(orderId)}/usdc/confirm`, { txHash }, { timeoutMs: 90_000 }),

    /**
     * Corrects the delivery address, on-site contact and note while the order
     * is AWAITING_PAYMENT (the payer can do the same on the hosted payment
     * page). The price stays as quoted, so the new address must be in an area
     * Dunback delivers to, inside the restaurant's delivery area and within
     * about a mile of the original; otherwise it fails with 422
     * `delivery_area_not_launched`, `outside_delivery_area` or `address_moved`
     * (create a new catering request instead). Sends `order.delivery_updated`.
     */
    updateDelivery: (orderId: string, input: UpdateDeliveryInput) =>
      this.request<Order>("POST", `/orders/${encodeURIComponent(orderId)}/delivery`, input),

    /** Unpaid orders: cancels the payment links. Confirmed orders: cancels at the restaurant (before its order deadline) and refunds. */
    cancel: (orderId: string, reason?: string) =>
      this.request<Order>("POST", `/orders/${encodeURIComponent(orderId)}/cancel`, { reason }),

    /** Polls until the order leaves AWAITING_PAYMENT/PAID/FULFILLING. */
    waitForSettlement: async (orderId: string, { timeoutMs = 15 * 60_000, intervalMs = 5_000 } = {}) => {
      const until = Date.now() + timeoutMs;
      for (;;) {
        const o = await this.orders.get(orderId);
        if (!["AWAITING_PAYMENT", "PAID", "FULFILLING"].includes(o.status)) return o;
        if (Date.now() > until) return o;
        await sleep(intervalMs);
      }
    },
  };
}
