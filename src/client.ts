import { DunbackApiError } from "./errors.js";
import type {
  CateringRequest, CateringRequestInput, Cuisine, Order, SelectOptionInput,
} from "./types.js";

export interface DunbackClientOptions {
  /** `dbk_live_<partner>_...` or `dbk_test_<partner>_...`. Server-side only: never ship it to a browser. */
  apiKey: string;
  /** Default https://dunbackmeadow.com/api/partner/v1 */
  baseUrl?: string;
  /** Per-request timeout, ms. Default 30 000. */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

const DEFAULT_BASE_URL = "https://dunbackmeadow.com/api/partner/v1";

function randomKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Server-side client for the Dunback Meadow Partner API.
 *
 *   const dunback = new DunbackClient({ apiKey: process.env.DUNBACK_API_KEY! });
 *   const req = await dunback.catering.create({...});
 *   const ready = await dunback.catering.waitForOptions(req.id);
 *   const order = await dunback.catering.select(ready.id, { optionId: ready.options[0].id });
 *   // send order.payment.hostedPaymentUrl (or the Stripe / USDC links) to the payer
 */
export class DunbackClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: DunbackClientOptions) {
    if (!opts?.apiKey || !/^dbk_(live|test)_/.test(opts.apiKey)) throw new Error("DunbackClient: a dbk_live_/dbk_test_ API key is required.");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
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
