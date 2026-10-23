/** Any non-2xx answer from the Partner API. */
export class DunbackApiError extends Error {
  /** Machine-readable, e.g. "invalid_request", "payment_amount_short", "order_deadline_passed". */
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "DunbackApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Codes a payer can act on (show the message and let them retry or pay another way). */
export const PAYMENT_ERROR_CODES = new Set([
  "payment_pending",
  "payment_not_found",
  "payment_amount_short",
  "payment_already_used",
  "invalid_payment_signature",
  "invalid_payment",
  "insufficient_funds",
  "settlement_failed",
]);

export function isPaymentError(e: unknown): e is DunbackApiError {
  return e instanceof DunbackApiError && PAYMENT_ERROR_CODES.has(e.code);
}
