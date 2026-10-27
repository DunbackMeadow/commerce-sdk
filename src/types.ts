// Shapes of the Dunback Meadow Partner API (v1). Money is in US dollars;
// USDC amounts are 1:1 with USD.

/** Cuisines every catalog lists. */
export type StandardCuisineId =
  | "american" | "chinese" | "mexican" | "italian" | "japanese"
  | "indian" | "thai" | "mediterranean" | "korean" | "vietnamese";

/** A cuisine a restaurant named itself ("custom:peruvian"); take these from listCuisines(). */
export type CustomCuisineId = `custom:${string}`;

export type CuisineId = StandardCuisineId | CustomCuisineId;

/**
 * How the catering is served; the host chooses.
 *   "buffet"      trays and platters guests share. Only restaurants with
 *                 catering dishes (trays) for mains.
 *   "meal_boxes"  one individually packed meal per guest, from restaurants'
 *                 regular dishes: more dishes and usually more restaurants.
 */
export type CateringServiceStyle = "buffet" | "meal_boxes";

export interface Cuisine {
  id: CuisineId;
  /** For a custom cuisine, the restaurant's own name for it ("Peruvian"). */
  label: string;
  /**
   * Restaurants serving this cuisine: in the venue's metro area when you pass
   * a venue to listCuisines(), else on the whole platform. With `guests`,
   * only restaurants whose catering policies allow that many guests (most
   * guests per order, and a minimum order that many guests are likely to
   * reach). 0 = none.
   */
  restaurants: number;
  /**
   * true for a cuisine a restaurant declared that isn't a standard one. These
   * are listed only where at least one restaurant serves them, after the
   * standard cuisines.
   */
  custom?: boolean;
  /**
   * Only when you passed `guests`: the least advance notice (hours before
   * delivery) one of these restaurants needs for that many guests. 0: no notice
   * needed beyond the usual order cutoff; null: no restaurant. Make sure the
   * host's guest list closes, and catering is ordered, at least this early.
   */
  noticeHours?: number | null;
}

/** Where an event is, for `listCuisines(venue)`: ZIP alone, or city + state, is enough. */
export interface VenueLocation {
  city?: string;
  state?: string;
  zip?: string;
}

/** GET /catalog/cuisines. */
export interface CuisineCatalog {
  data: Cuisine[];
  /** "metro": counts restaurants in the venue's metro area only. "platform": all restaurants (no venue given). */
  scope: "metro" | "platform";
  /** The venue's metro area; null without a venue, or when Dunback doesn't serve that area (all counts 0). */
  metro: { id: string; name: string } | null;
  /** The expected guest count the counts are for; null when none was given. */
  guests: number | null;
  /** The service style the counts are for; null when none was given. */
  serviceStyle: CateringServiceStyle | null;
}

/** Options for listCuisines() / cuisineCatalog(). */
export interface CuisineQuery {
  /** Count only restaurants that serve catering this way. */
  serviceStyle?: CateringServiceStyle;
  /**
   * Expected guests (e.g. the event's capacity, or the host's estimate): count
   * only restaurants able to cater that many. Whole number, 1 or more.
   */
  guests?: number;
}

/**
 * A restaurant's own catering policies. Each is null when the restaurant has
 * no such policy. Dunback only offers options that meet them.
 */
export interface CateringPolicies {
  /** Food subtotal (USD, before delivery, fees and tax) a catering order must reach. */
  minimumOrder: number | null;
  /** Most guests it caters for in one order. */
  maxGuests: number | null;
  /** No delivery fee when the food subtotal reaches this (USD). */
  freeDeliveryOver: number | null;
  /**
   * Advance notice by party size: more than `overGuests` guests need at least
   * `hours` before delivery. [] when none. `orderBy` already reflects it.
   */
  noticeTiers: Array<{ overGuests: number; hours: number }>;
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
  /** Buffet (trays to share) or individual meal boxes. Default "meal_boxes". */
  serviceStyle?: CateringServiceStyle;
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
  /** "Free delivery" (amount 0) when the restaurant waived the delivery fee. */
  label: string;
  amount: number;
  /** Why, for a waived delivery fee ("Free delivery on catering orders of $300.00 or more."). */
  note?: string;
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
  /** "main" (one serving per guest), "drink" (one per guest) or "extra" (shared). */
  role: "main" | "drink" | "extra";
  /** Units ordered: portions, or trays for a catering dish (see `serves`). */
  quantity: number;
  /** Price of one unit (a whole tray for a catering dish). */
  unitPrice: number;
  /**
   * A restaurant's catering dish (tray, platter): people one unit serves, e.g.
   * 2 trays serving 8 each feed 16 guests. Absent for single portions.
   * Dunback uses a restaurant's catering dishes first.
   */
  serves?: number;
  allergens: string[];
  dietaryTags: string[];
  /** true for a shared dish added so the order reaches the restaurant's minimum. */
  addedForMinimum?: boolean;
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
  serviceStyle: CateringServiceStyle;
  restaurant: { name: string; distanceMiles: number | null; imageUrl: string | null; policies: CateringPolicies };
  items: CateringItem[];
  /**
   * Food (USD) to add for the restaurant's free delivery; null when delivery
   * is already free or the restaurant has no such policy.
   */
  freeDeliveryShortfall: number | null;
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
  serviceStyle: CateringServiceStyle;
  guestCount: number;
  deliveryDeadlineLocal: string;
  timeZone: string;
  daypart: string;
  allergySummary: Array<{ constraint: string; guests: string[] }>;
  options: CateringOption[];
  /** Why restaurants were left out, when status is NO_OPTIONS. */
  unavailableReasons?: UnavailableReason[];
  orderId: string | null;
  error: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
}

/** Why a restaurant can't cater an event. Unknown codes may be added: treat them as "other". */
export type UnavailableReasonCode =
  | "party_too_large"        // more guests than the restaurant caters for
  | "below_minimum_order"    // the order can't reach the restaurant's minimum
  | "notice_too_short"       // the restaurant needs more advance notice for this many guests
  | "no_buffet_dishes"       // buffet asked for; the restaurant has no catering trays
  | "style_not_offered"      // meal boxes asked for; the restaurant doesn't pack them
  | "outside_delivery_area"
  | "not_serving_then"       // closed, or not serving that meal at that time
  | "different_cuisine"
  | "restaurant_declined";   // the restaurant couldn't price the order

export interface UnavailableReason {
  /** Restaurant name. */
  name: string;
  code?: UnavailableReasonCode | (string & {});
  /** Human-readable, e.g. "can't cater 120 guests (caters for at most 60 guests)". */
  reason: string;
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

/** Where an order is delivered. `deliveryNotes` is your note only, without the catering and allergy text Dunback adds for the restaurant. */
export interface OrderDelivery {
  address: Required<Address>;
  onsiteContact: { name: string; phone: string };
  deliveryNotes: string;
  /** True while the order is AWAITING_PAYMENT: the details can still be corrected (orders.updateDelivery). */
  editable: boolean;
}

/** POST /orders/:id/delivery: correct the delivery details before payment. */
export interface UpdateDeliveryInput {
  deliveryAddress: Address;
  /** Leave out to keep the current on-site contact. */
  onsiteContact?: { name: string; phone: string };
  /** Replaces the current note. Default "" (no note). */
  deliveryNotes?: string;
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
  delivery: OrderDelivery;
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
  | "order.delivery_updated"
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
