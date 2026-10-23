import { createHmac, timingSafeEqual } from "node:crypto";
import type { WebhookEvent } from "./types.js";

/**
 * Verifies a Dunback webhook and returns the parsed event.
 *
 *   Dunback-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
 *
 * Pass the RAW request body (bytes or string exactly as received), not
 * re-serialized JSON. Throws if the signature is wrong or older than
 * `toleranceSeconds` (replay protection).
 *
 *   app.post("/dunback/webhook", express.raw({ type: "application/json" }), (req, res) => {
 *     const event = verifyWebhook(req.body, req.header("Dunback-Signature"), process.env.DUNBACK_WEBHOOK_SECRET!);
 *     ...
 *     res.sendStatus(200);
 *   });
 */
export function verifyWebhook<T = WebhookEvent>(
  rawBody: string | Uint8Array,
  signatureHeader: string | undefined | null,
  secret: string,
  { toleranceSeconds = 300, now = Date.now() }: { toleranceSeconds?: number; now?: number } = {},
): T {
  if (!signatureHeader) throw new Error("Missing Dunback-Signature header.");
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((kv) => kv.trim().split("=", 2) as [string, string]),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) throw new Error("Malformed Dunback-Signature header.");
  if (Math.abs(now / 1000 - t) > toleranceSeconds) throw new Error("Webhook timestamp is outside the tolerance window.");

  const body = typeof rawBody === "string" ? rawBody : Buffer.from(rawBody).toString("utf8");
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Invalid webhook signature.");
  return JSON.parse(body) as T;
}

/** Builds a signature header (for tests of your webhook endpoint). */
export function signWebhookPayload(rawBody: string, secret: string, t = Math.floor(Date.now() / 1000)): string {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex")}`;
}
