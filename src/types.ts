// Shapes of the Dunback Meadow Partner API (v1). Money is in US dollars;
// USDC amounts are 1:1 with USD.

export type CuisineId =
  | "american" | "chinese" | "mexican" | "italian" | "japanese"
  | "indian" | "thai" | "mediterranean" | "korean" | "vietnamese";

export interface Cuisine {
  id: CuisineId;
  label: string;
  /** Restaurants on Dunback currently serving this cuisine (0 = none yet). */
  restaurants: number;
}

export interface Address {
  address1: string;
  address2?: string;
  city: string;
  state?: string;
  zip: string;
  /** ISO 3166-1 alpha-2, default "US". */
  country?: string;
}

export interface Attendee {
  /** Your id for the guest (e.g. Luma guest id). */
  externalId?: string;
  name: string;
  email?: string;
  phone?: string;
  /** Free text, as the guest wrote it: "peanuts, shellfish", "celiac", "none". */
  allergies?: string;
  /** Free text: "vegetarian", "halal", ... */
  dietaryPreferences?: string;
  /**
   * The guest agreed to share their allergy/diet notes with Dunback Meadow and
   * the restaurant. Required (true) whenever `allergies` or
   * `dietaryPreferences` says more than "none"; otherwise the request fails
   * with `allergy_consent_required`.
   */
  allergyConsent?: boolean;
}

export interface CateringRequestInput {
  /** Your stable reference, e.g. `luma:evt-AbC123`. Used to look requests up later. */
  partnerReference: string;
  event: {
    name: string;
    /** ISO 8601 with offset, e.g. "2026-11-14T02:00:00Z". */
    startsAt: string;
    /** IANA time zone of the venue, e.g. "America/Los_Angeles". */
    timeZone: string;
    url?: string;
  };
  /** Venue-local "YYYY-MM-DDTHH:mm". Default: 30 minutes before the event starts. */
  deliveryDeadlineLocal?: string;
  cuisine: CuisineId;
  /** Non-alcoholic drinks, one per guest. Default true. */
  includeDrinks?: boolean;
  /** Options above this card price per guest are flagged `withinBudget: false`. */
  budgetPerGuest?: number;
  deliveryAddress: Address;
  /** Who receives the delivery at the venue. */
  onsiteContact: { name: string; phone: string; email?: string };
  deliveryNotes?: string;
  host: { name: string; email: string; phone?: string };
  attendees: Attendee[];
}

export interface PriceLine {
  code: "food" | "delivery" | "restaurant_fee" | "tax" | "platform_fee" | "service_fee";
  label: string;
  amount: number;
}

export interface Price {
  currency: "USD";
  lines: PriceLine[];
  restaurantAmount: number;
  dunbackCommission: number;
  dunbackServiceFee: number;
  totals: {
    /** What a USDC payment must be. */
    usdc: number;
    /** What a card payment is (USDC total + card processing). */
    card: number;
    cardProcessingFee: number;
  };
  perGuest: { usdc: number; card: number };
  commissionRate: number;
}

export interface CateringItem {
  name: string;
  description: string;
  imageUrl: string | null;
  /** "main" (one per guest), "drink" (one per guest) or "extra" (shared). */
  role: "main" | "drink" | "extra";
  quantity: number;
  unitPrice: number;
  allergens: string[];
  dietaryTags: string[];
}

export interface AllergyCoverage {
  /** "no peanut, shellfish", "vegetarian", "no restrictions", ... */
  constraint: string;
  guests: number;
  dishes: string[];
}

export interface UnfedGuests {
  constraint: string;
  guests: string[];
  what?: "drink";
}

export interface CateringOption {
  id: string;
  title: string;
  strategy: "favorites" | "value" | "variety";
  restaurant: { name: string; distanceMiles: number | null; imageUrl: string | null };
  items: CateringItem[];
  allergyCoverage: AllergyCoverage[];
  /** Guests no dish on this menu is known to be safe for. Show this to the host. */
  unfedGuests: UnfedGuests[];
  price: Price;
  withinBudget?: boolean;
  /** Pay before this instant (ISO), or the restaurant can't make the event time. */
  orderBy: string | null;
}

export type CateringRequestStatus = "COMPOSING" | "OPTIONS_READY" | "NO_OPTIONS" | "SELECTED" | "FAILED";

export interface CateringRequest {
  id: string;
  object: "catering_request";
  status: CateringRequestStatus;
  partnerReference: string;
  event: CateringRequestInput["event"] & { startsAtLocal: string };
  cuisine: { id: CuisineId; label: string };
  guestCount: number;
  deliveryDeadlineLocal: string;
  timeZone: string;
  daypart: string;
  allergySummary: Array<{ constraint: string; guests: string[] }>;
  options: CateringOption[];
  unavailableReasons?: Array<{ name: string; reason: string }>;
  orderId: string | null;
  error: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface SelectOptionInput {
  optionId: string;
  payer?: { name?: string; email?: string };
  /** Default both. */
  paymentMethods?: Array<"stripe" | "usdc">;
  /** Where Stripe Checkout returns to (https, on your registered domains). Default: Dunback's payment page. */
  successUrl?: string;
  cancelUrl?: string;
}

export type OrderStatus =
  | "AWAITING_PAYMENT" | "PAID" | "FULFILLING" | "CONFIRMED"
  | "EXPIRED" | "CANCELLED" | "REFUNDED" | "REFUND_PENDING" | "NEEDS_ATTENTION";

export interface UsdcPaymentInstructions {
  network: "polygon";
  chainId: 137;
  /** USDC contract on Polygon. */
  asset: string;
  receiver: string;
  /** Exact amount to send, e.g. "412.380317" (the last digits identify the order). */
  amount: string;
  amountAtomic: string;
  /** EIP-681 link most wallets can open. */
  paymentUri: string;
  note: string;
  /** For agents: POST here to pay with x402 (see payOrderWithX402). */
  x402Url?: string;
}

export interface Order {
  id: string;
  object: "order";
  status: OrderStatus;
  partnerReference: string;
  cateringRequestId: string;
  title: string;
  summary: string;
  restaurant: { name: string };
  deliveryDeadlineLocal: string;
  timeZone: string;
  guestCount: number;
  items: CateringItem[];
  allergyCoverage: AllergyCoverage[];
  unfedGuests: UnfedGuests[];
  price: Price;
  payment: {
    expiresAt?: string;
    /** Dunback-hosted page offering every payment method. Safe to show to the payer. */
    hostedPaymentUrl?: string;
    stripe?: { checkoutUrl: string; amount: number; currency: "usd" } | null;
    usdc?: UsdcPaymentInstructions | null;
    received: { method: "stripe" | "usdc" | "x402"; amount: number; currency: string; reference: string; payer?: string; at: string } | null;
    lastError: { method: string; code: string; message: string; at: string } | null;
  };
  fulfillment: {
    restaurantOrderIds: string[];
    providerPayment: { amount: number; payTo: string; txHash: string | null; verifiedOnChain: boolean; network: "polygon" };
    confirmedAt: string;
  } | null;
  refund: { status: "SUCCEEDED" | "PENDING"; method: "stripe" | "usdc"; amount: number; note?: string } | null;
  error: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
}

export type WebhookEventType =
  | "catering.options_ready" | "catering.no_options" | "catering.failed"
  | "order.created" | "order.confirmed" | "order.payment_failed" | "order.expired"
  | "order.failed" | "order.needs_attention" | "order.cancelled"
  | "ping";

/** `data` of a `ping` event, sent by "Send test event" in the Developer Dashboard. */
export interface PingData {
  object: "ping";
  appId: string;
  message: string;
}

export interface WebhookEvent<T = CateringRequest | Order | PingData> {
  id: string;
  type: WebhookEventType;
  /** Unix seconds. */
  created: number;
  /** Present on `ping`: true for a production endpoint. */
  livemode?: boolean;
  data: T;
}

/** GET /me: the app and environment an API key belongs to. */
export interface AppInfo {
  object: "app";
  id: string;
  name: string;
  mode: "live" | "test";
  webhookUrl: string | null;
  allowedReturnHosts: string[];
}
