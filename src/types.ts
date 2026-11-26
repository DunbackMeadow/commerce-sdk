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

/** GET /catalog/restaurants: restaurants a host can name instead of choosing a cuisine. */
export interface RestaurantSummary {
  name: string;
  cuisine: { id: CuisineId; label: string } | null;
  secondaryCuisine: { id: CuisineId; label: string } | null;
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
  /**
   * A restaurant the host prefers (see listRestaurants()). All options then
   * come from it, and no cuisine is chosen: send restaurantName OR cuisine,
   * never both. If it can't cater the event, the request says why
   * (`restaurant.available: false`, `restaurant.reason`) and the options are
   * from other restaurants.
   */
  restaurantName?: string;
  /**
   * Required unless you give restaurantName, dishPreferences or mealType
   * "breakfast" (then any cuisine). Restaurants whose primary cuisine this is
   * are matched first; restaurants listing it as their secondary cuisine only
   * when none of those can cater.
   */
  cuisine?: CuisineId;
  /**
   * A combination style: cuisine "chinese" + secondaryCuisine "american" asks
   * for Chinese-American, matched only by restaurants that declared both, in that order.
   */
  secondaryCuisine?: CuisineId;
  /** Buffet (trays to share) or individual meal boxes. Default "meal_boxes". */
  serviceStyle?: CateringServiceStyle;
  /** Food catering: also non-alcoholic drinks, one per guest. Default true. */
  includeDrinks?: boolean;
  /**
   * Drinks only, no food, one drink per guest: from `restaurantName` (a cafe,
   * a boba shop...) or any restaurant serving `drinkTypes`. Don't send a
   * cuisine with it. `serviceStyle` "meal_boxes" = individual cups, "buffet" =
   * shared containers (carafes, gallons). Default false.
   */
  drinksOnly?: boolean;
  /**
   * Which drinks: ids from `listDrinkTypes()` ("coffee", "boba", "milk_tea"...)
   * or a short word for any other ("horchata"). Up to 8. With `drinksOnly`,
   * only restaurants serving them are matched and guests are shared among the
   * types; with food, the drinks come from these types when the restaurant has them.
   */
  drinkTypes?: DrinkTypeId[];
  /** Soft: options above this card price per guest are only flagged `withinBudget: false`. */
  budgetPerGuest?: number;
  /**
   * Hard budget, USD: options priced above it are not offered. Compared with
   * what the host would pay: the card total, or the USDC total at a restaurant
   * that takes no card. When it leaves fewer than three options,
   * `CateringRequest.budget.message` says how far to raise it for three.
   */
  maxTotal?: number;
  /** Hard budget per guest, USD (see `maxTotal`). */
  maxPerGuest?: number;
  /**
   * Kinds of dishes the host wants, up to 8: "sushi", "seafood", "pastries",
   * "bagels", "tacos"... The mains come from dishes that match; a guest no
   * matching dish is safe for gets another safe main (its allergyCoverage
   * entry says `outsidePreferences: true`). Any cuisine when none is given.
   */
  dishPreferences?: string[];
  /**
   * The kind of food, whatever the delivery time: "breakfast" (pastries,
   * bagels, egg dishes, fruit...), "lunch" or "dinner". Without it, a delivery
   * before 10:30 prefers breakfast food without requiring it.
   */
  mealType?: CateringMealType;
  /** About this share (0..1) of the main servings spicy; 0 = nothing spicy. */
  spicyShare?: number;
  /** Diets every guest's food must fit, e.g. ["vegetarian"] for an all-vegetarian event. */
  partyDiet?: PartyDiet[];
  deliveryAddress: Address;
  /** Who receives the delivery at the venue. */
  onsiteContact: { name: string; phone: string; email?: string };
  deliveryNotes?: string;
  host: { name: string; email: string; phone?: string };
  attendees: Attendee[];
}

export type CateringMealType = "breakfast" | "lunch" | "dinner";

export type PartyDiet = "vegetarian" | "vegan" | "halal" | "kosher" | "gluten_free" | "dairy_free" | "pescatarian";

/** What a hard budget (`maxTotal` / `maxPerGuest`) did to the options. */
export interface CateringBudgetResult {
  maxTotal: number | null;
  maxPerGuest: number | null;
  /** The budget for the whole order (the tighter of the two), USD. */
  limit: number;
  /** Options offered (all within the budget). */
  withinBudget: number;
  /** Options left out for being over the budget. */
  overBudget: number;
  /** With fewer than three options: about how far to raise the budget for three (null otherwise). */
  suggestedMaxTotal: number | null;
  suggestedMaxPerGuest: number | null;
  /**
   * Show this to the host when set, e.g. "Only 2 catering offers fit your
   * budget of $1,000. Raising your budget to about $1,150 would give you 3
   * offers to choose from."
   */
  message: string | null;
}

/** A drink type from `listDrinkTypes()`, or any short word ("horchata"). */
export type DrinkTypeId =
  | "coffee" | "tea" | "milk_tea" | "boba" | "fruit_tea" | "smoothie" | "juice" | "soda" | "hot_chocolate" | "water"
  | (string & {});

export interface DrinkType {
  id: DrinkTypeId;
  label: string;
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
  /** The host's service fee: serviceFeeRate x (food and drinks + the restaurant's service charge) (the `service_fee` line). */
  dunbackServiceFee: number;
  /** Dunback's service fee rate on catering orders (0.05 = 5%). */
  serviceFeeRate: number;
  totals: {
    /** What a USDC payment must be. */
    usdc: number;
    /** What a card payment is (USDC total + card processing). */
    card: number;
    cardProcessingFee: number;
  };
  perGuest: { usdc: number; card: number };
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
  /** The request's dishPreferences this dish matches ("sushi"). */
  matches?: string[];
  /** true for a spicy main (see spicyShare). */
  spicy?: boolean;
  /**
   * A drink's choices, from the restaurant's own options: ["Sweetness: 50%",
   * "Toppings: Boba"]. Each option mixes them differently (favorites: the
   * restaurant's defaults; value: no paid add-ons; variety: several versions).
   */
  modifiers?: string[];
}

export interface AllergyCoverage {
  /** "no peanut, shellfish", "vegetarian", "no restrictions", ... */
  constraint: string;
  guests: number;
  dishes: string[];
  /** None of the dishes asked for (dishPreferences / mealType) is safe for these guests: they get other safe dishes. */
  outsidePreferences?: boolean;
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
  /** With budgetPerGuest (soft) or maxTotal / maxPerGuest (hard; always true then). */
  withinBudget?: boolean;
  /** With spicyShare only: main servings that are spicy, of all main servings. */
  spicyServings?: number;
  mainServings?: number;
  /**
   * false when this restaurant hasn't set up card payments on Dunback (its
   * Stripe account): the option can then only be paid in USDC, and selecting
   * it with paymentMethods ["stripe"] fails with card_payments_unavailable.
   */
  acceptsCard: boolean;
  /** How this option can be paid: ["stripe", "usdc"], or ["usdc"] when acceptsCard is false. */
  paymentMethods: Array<"stripe" | "usdc">;
  /** Pay before this instant (ISO), or the restaurant can't make the event time. */
  orderBy: string | null;
  /** Dunback's catering cancellation and refund policy, in one paragraph. Show it with the option. */
  cancellationPolicy: string;
}

export type CateringRequestStatus = "COMPOSING" | "OPTIONS_READY" | "NO_OPTIONS" | "SELECTED" | "FAILED";

export interface CateringRequest {
  id: string;
  object: "catering_request";
  status: CateringRequestStatus;
  partnerReference: string;
  event: CateringRequestInput["event"] & { startsAtLocal: string };
  /** null when the host named a restaurant instead. */
  cuisine: { id: CuisineId; label: string } | null;
  secondaryCuisine?: { id: CuisineId; label: string } | null;
  /**
   * The restaurant the host named, or null. `available` false: it can't
   * cater this event (`reason`), and the options are from other restaurants.
   * `found` false: no restaurant by that name. null fields: still composing.
   */
  restaurant: {
    requested: string;
    found: boolean | null;
    /** The restaurant found: may differ from `requested` (part of a name, or a misspelling). */
    name: string | null;
    /** true: no restaurant has that name; `name` is the closest spelling found (e.g. "Ragoon Ruby" -> "Rangoon Ruby Palo Alto"). Show the host which restaurant it is. */
    closeMatch?: boolean;
    available: boolean | null;
    reason: string | null;
  } | null;
  serviceStyle: CateringServiceStyle;
  /** Drinks only, no food. */
  drinksOnly: boolean;
  includeDrinks: boolean;
  drinkTypes: DrinkType[];
  dishPreferences: string[];
  mealType: CateringMealType | null;
  spicyShare: number | null;
  partyDiet: PartyDiet[];
  maxTotal: number | null;
  maxPerGuest: number | null;
  /** With a hard budget only. Show `budget.message` to the host when it is set. */
  budget: CateringBudgetResult | null;
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
  | "no_matching_dishes"     // none of the dishes asked for (dishPreferences, mealType, partyDiet)
  | "over_budget"            // its options are priced above maxTotal / maxPerGuest
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
  /** What was priced and paid for. */
  items: CateringItem[];
  /**
   * Set when the restaurant changed the order after calling the host and
   * getting their agreement (webhook `order.revised`). `revision.items` is
   * what it will now prepare. The price never changes with a revision.
   * Show the note and the revised items to the host.
   */
  revision: OrderRevision | null;
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
    /**
     * How Dunback paid the restaurant: in USDC on Polygon for a USDC/x402 order,
     * or through the restaurant's Stripe account for a card order (details
     * of a card payout are not shared).
     */
    providerPayment:
      | { method?: "usdc_x402"; amount: number; payTo: string; txHash: string | null; verifiedOnChain: boolean; network: "polygon" }
      | { method: "stripe_connect"; status: "PAID" | "PENDING" };
    confirmedAt: string;
  } | null;
  /** The latest refund. */
  refund: { status: "SUCCEEDED" | "PENDING"; method: "stripe" | "usdc"; amount: number; note?: string } | null;
  /**
   * Every refund of the order. `reason`: "cancel" (the host cancelled: the
   * restaurant's part), "failed" (the restaurant couldn't take it), or, for one
   * delivery the host isn't at fault for (refunded in full), "cancelled" (by the
   * restaurant), "late" or "not_delivered".
   */
  refunds?: Array<{
    amount: number; method: "stripe" | "usdc"; status: "SUCCEEDED" | "PENDING";
    reason: string; detail: string | null; at: string; restaurantOrderId?: string;
  }>;
  /** Where the order stands for cancelling. Show `policy` with the order. */
  cancellation: OrderCancellation;
  /**
   * Late-delivery refunds: a delivery `afterMinutes` or more past the delivery
   * deadline counts as late. `requestableFrom` is the earliest moment that can
   * be true: offer "request a refund" (`orders.requestRefund`) only from then.
   */
  lateRefund?: { afterMinutes: number; requestableFrom: string | null };
  /**
   * Each restaurant order's delivery. For 48 hours after a delivery is
   * recorded the host can confirm it (`orders.confirmDelivery`) or report a
   * problem (`orders.reportProblem`): offer those while `canConfirm` /
   * `canReportProblem` are true. Webhook `order.delivered` when one is recorded.
   */
  deliveries?: OrderDelivery[];
  error: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Dunback's uniform catering cancellation and refund policy, as it applies to
 * an order now:
 *   "unpaid"            nothing charged; cancelling closes the payment links
 *   "before_commitment" cancel for the restaurant's full refund (Dunback's fees kept)
 *   "after_commitment"  may still cancel until delivery; Dunback decides the
 *                       refund with the restaurant, 0 up to `refundIfCancelledNow.maximum`
 *   "closed"            can't be cancelled
 * Before cancelling, show `notice` to the host and get their confirmation.
 * After the commitment deadline, pass `acceptPostCommitment: true` to
 * orders.cancel(); without it the call fails with 409
 * `post_commitment_confirmation_required` (details.cancellation has this object).
 */
export interface OrderCancellation {
  policy: string;
  phase: "unpaid" | "before_commitment" | "after_commitment" | "closed";
  cancellable: boolean;
  commitmentDeadlineUtc: string | null;
  deliveryDeadlineUtc: string | null;
  notice: string | null;
  refundIfCancelledNow:
    | { kind: "restaurant_full_refund"; amount: number | null }
    | { kind: "decided_by_dunback"; maximum: number | null }
    | null;
  requiresAcceptPostCommitment: boolean;
}

/**
 * orders.requestRefund(): a catering delivery made at or after Dunback's
 * catering late-delivery threshold (60 minutes by default). Both texts are
 * required and go to Dunback's reviewer.
 */
export interface LateRefundRequestInput {
  /** Which restaurant order (order.fulfillment.restaurantOrderIds); default: the late one. */
  restaurantOrderId?: string;
  /** Why the host is asking for a refund. */
  reason: string;
  /** How the late delivery affected the event. */
  impact: string;
}

/** 202 from orders.requestRefund(). Dunback's decision follows as `order.refund_decided`. */
export interface LateRefundRequest {
  object: "refund_request";
  status: "REQUESTED";
  orderId: string;
  restaurantOrderId: string;
  lateMinutes: number;
  /** The most the refund can be: the restaurant's part of that delivery. */
  maximum: number;
  policy: string;
  requestedAt: string;
}

export interface OrderDelivery {
  restaurantOrderId: string;
  status: "pending" | "on_the_way" | "delivered" | "not_delivered" | "cancelled";
  deliveredAt: string | null;
  lateMinutes: number;
  /** A Dunback or restaurant staff "driver", or a "courier" company the restaurant booked. */
  deliveredBy: "driver" | "courier" | null;
  courierCompany: string | null;
  /**
   * Who recorded the delivery time: the "driver" or "courier" (Dunback's clock,
   * with a photo and location), or the "restaurant" (from the courier's proof
   * of delivery, when the courier didn't record it). Show it with the time.
   */
  timeRecordedBy: "driver" | "courier" | "restaurant" | null;
  hostConfirmedAt: string | null;
  problemReport: {
    type: DeliveryProblemType; label: string; description: string; reportedAt: string; wantsRefund: boolean; photoCount: number;
  } | null;
  /** 48 hours after delivery. */
  problemReportableUntil: string | null;
  canConfirm: boolean;
  canReportProblem: boolean;
}

export type DeliveryProblemType =
  | "MISSING_ITEMS" | "DAMAGED" | "WRONG_ORDER" | "NO_SETUP" | "CONDUCT" | "LATE" | "NOT_RECEIVED" | "OTHER";

/**
 * orders.reportProblem(): anything wrong with a delivery, within 48 hours of
 * it. The restaurant is told at once. With `wantsRefund`, Dunback reviews the
 * report against its records of the delivery and decides the refund (0 up to
 * the restaurant's part; Dunback's fees aren't refunded): webhook
 * `order.refund_decided` (basis "delivery_problem", or "late_delivery" for a
 * LATE report of a delivery recorded as late).
 */
export interface ProblemReportInput {
  /** Which delivery (order.deliveries[].restaurantOrderId); default: every reportable one. */
  restaurantOrderId?: string;
  type: DeliveryProblemType;
  /** What happened, in the host's words (10 to 2000 characters). */
  description: string;
  wantsRefund?: boolean;
  /** Up to 3 photos, 5 MB each, base64 without the data: prefix. */
  photos?: Array<{ contentType: "image/jpeg" | "image/png" | "image/webp"; data: string }>;
}

/** 202 from orders.reportProblem(). */
export interface ProblemReport {
  object: "problem_report";
  orderId: string;
  reportedAt: string;
  reports: Array<{
    restaurantOrderId: string;
    type: DeliveryProblemType;
    refundRequested: boolean;
    refundBasis: "delivery_problem" | "late_delivery" | null;
    /** The most the refund can be: the restaurant's part of that delivery. */
    maximum: number | null;
  }>;
  order: Order;
}

/** `data` of `order.delivered`: the order, and which deliveries were just recorded. */
export interface DeliveredData extends Order {
  deliveredNow: string[];
  /** How long the host can confirm or report a problem (48). */
  problemReportHours: number;
}

/** `data` of `order.delivered_late`: the order, and which deliveries were late. */
export interface DeliveredLateData extends Order {
  lateDeliveries: Array<{ restaurantOrderId: string; lateMinutes: number }>;
  /** Dunback's policy for late catering refunds. Show it with a "Request a refund" action. */
  lateRefundPolicy: string;
}

/** Options for orders.cancel(). */
export interface CancelOrderOptions {
  /** The host confirmed cancelling after the commitment deadline (the refund is then decided by Dunback). */
  acceptPostCommitment?: boolean;
}

/**
 * `data` of `order.refund_decided`: the order, plus Dunback's decision on a
 * restaurant order the host cancelled after its commitment deadline.
 * `refund` is null when nothing is refunded (amount 0).
 */
export interface RefundDecidedData extends Order {
  refundDecision: {
    restaurantOrderId: string;
    /** Why the refund was decided: a cancellation after the commitment deadline, a late delivery, or a reported delivery problem. */
    basis: "cancelled_after_commitment" | "late_delivery" | "delivery_problem";
    percentage: number;
    amount: number;
    explanation: string;
    refund: { status: "SUCCEEDED" | "PENDING"; method: "stripe" | "usdc"; amount: number; note?: string } | null;
  };
}

export interface OrderRevision {
  /** "Revised by restaurant with user agreement." */
  note: string;
  revisedAt: string;
  /** The restaurant's reason, as told to the host. */
  reason: string;
  items: Array<{ name: string; quantity: number; modifiers: string[] }>;
  history: Array<{ revisedAt: string; reason: string }>;
}

export type WebhookEventType =
  | "catering.options_ready" | "catering.no_options" | "catering.failed"
  | "order.created" | "order.confirmed" | "order.payment_failed" | "order.expired"
  | "order.failed" | "order.needs_attention" | "order.cancelled" | "order.refunded"
  | "order.refund_decided" | "order.delivered" | "order.delivered_late" | "order.delivery_updated"
  | "order.revised"
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
