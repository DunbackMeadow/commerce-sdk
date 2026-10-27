# Luma × Dunback Meadow: integration guide

This guide covers everything Luma needs to build so hosts can order food and
drinks for their events through Dunback Meadow. A complete reference
implementation is in [`examples/luma-integration`](../examples/luma-integration).

## What hosts and guests see

| Step | Who                                 | What they do in Luma                                                                                                                                   | What Luma does                                                                                                  |
| ---- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| 1    | Host, creating an event             | Turns on **Food & drinks by Dunback Meadow**, picks a cuisine (American, Chinese, Mexican, …), optionally sets a budget per guest and turns drinks off | Saves `DunbackEventSettings` with the event, then adds the allergy question to the registration form            |
| 2    | Guest, registering                  | Optionally answers _"Food allergies or dietary needs"_                                                                                                 | Stores the answer with the registration, as usual                                                               |
| 3    | Host, after the guest list is final | Opens the event page and clicks **Order Food via Dunback Meadow**                                                                                      | Sends attendees (name, email, phone, allergy note) to Dunback                                                   |
| 4    | Dunback                             | Composes **3 catering options** with prices and fee breakdowns (usually within 30 s)                                                                   | Luma shows the options when the `catering.options_ready` webhook arrives                                        |
| 5    | Host                                | Picks an option                                                                                                                                        | Luma gets an order with payment links: **Pay by card** (Stripe) and **Pay with USDC**                           |
| 6    | Host                                | Pays                                                                                                                                                   | Dunback verifies the payment, pays the restaurant, and the restaurant confirms. Luma receives `order.confirmed` |
| 7    | Restaurant                          | Delivers before the event starts (default: 30 minutes before)                                                                                          | —                                                                                                               |

If a payment fails, Luma receives `order.payment_failed` with a message to show
the host. If the restaurant can't take the order after payment, the host is
refunded automatically and Luma receives `order.failed`.

## 1. Setup

1. **Credentials, from the Dunback Developer Dashboard**
   (<https://dunbackmeadow.com/developer>). Luma's developer account applies
   once as a business and is reviewed by Dunback. Then Luma creates an app
   ("Luma event catering"), which has:
   - a sandbox key (`dbk_test_app-…`) for `https://sandbox.dunbackmeadow.com/api/partner/v1`
   - a production key (`dbk_live_app-…`) for `https://dunbackmeadow.com/api/partner/v1`
   - a webhook signing secret (`whsec_…`) for each environment

   Each key is shown once, when it's created. To rotate it, delete it in the
   dashboard and create a new one.
2. **Set in the dashboard, for each environment:**
   - Luma's webhook URL (then click **Send test event**)
   - the allowed return hosts for Stripe success and cancel URLs (for example `lu.ma`)
3. **Install the SDK on Luma's servers:**

   ```bash
   npm install @dunbackmeadow/commerce-sdk
   ```

   ```ts
   // The key decides the environment: dbk_test_ -> sandbox, dbk_live_ -> production.
   const dunback = new DunbackClient({ apiKey: process.env.DUNBACK_API_KEY! });
   ```

> The API key gives full ordering power. Keep it server-side. Luma's frontend
> talks only to Luma's backend.

## 2. Event creation: enable catering and pick a cuisine

```ts
// Backend: options for the picker, for the venue the host entered.
// Cache for a few minutes per venue; ask again when the address changes.
const venue = toVenueLocation(event.geo_address_json); // null until street, city and ZIP are in
const { data: cuisines, metro } = await dunback.cuisineCatalog(venue, { guests: settings?.expectedGuests, serviceStyle: settings?.serviceStyle });
// [{ id: "mexican", label: "Mexican", restaurants: 4 }, ...]
// With a venue, `restaurants` counts restaurants in its metro area only;
// 0 means none there serves that cuisine yet. metro: { id, name } or null.
// With guests, only restaurants able to cater that many count: restaurants
// may limit guests per order or require a minimum order.
```

The host also chooses how food is served (`settings.serviceStyle`, asked by
`<DunbackCateringSettings>`): a **buffet** (trays to share; only restaurants
with catering trays) or **individual meal boxes** (one packed meal per guest;
more dishes and usually more restaurants). `buildCateringRequest()` sends it.

Pass the host's expected guest count (`settings.expectedGuests`, which
`<DunbackCateringSettings>` asks for, or the event's capacity) and the style,
and ask again when either changes. The real guest list is checked again when the host orders: if
it grew past what the chosen cuisine's restaurants cater for, the request ends
in `NO_OPTIONS` with `unavailableReasons[].code` `party_too_large`. Suggest
another cuisine then.

With `guests`, each cuisine also has `noticeHours`: restaurants can need more
advance notice for bigger parties (say 72 hours for more than 50 guests). Set
the event's `guestListDeadline` at least that long before delivery; ordering
later ends in `NO_OPTIONS` with code `notice_too_short`.
`<DunbackCateringSettings>` shows the notice under the cuisine.

Frontend: `<DunbackCateringSettings cuisines={cuisines} venueReady={!!venue} metroName={metro?.name} … />`.
While `venueReady` is false it shows no availability and asks the host to
enter the venue address first.

Save the host's choice with the event:

```ts
type DunbackEventSettings = {
  enabled: boolean;
  cuisine: CuisineId; // "american" | "chinese" | "mexican" | ...
  serviceStyle?: "buffet" | "meal_boxes"; // default "meal_boxes"
  includeDrinks?: boolean; // default true (non-alcoholic only)
  budgetPerGuest?: number; // USD; options above it are flagged, not hidden
  guestListDeadline?: string; // ISO; "Order Food" is offered from then on
  deliveryDeadlineLocal?: string; // default: 30 min before start, venue-local "YYYY-MM-DDTHH:mm"
  deliveryNotes?: string; // "Loading dock on Emerson St"
  onsiteContact?: { name: string; phone: string; email?: string }; // default: host
};
```

The ready-made `<DunbackCateringSettings>` component renders this form
(`@dunbackmeadow/commerce-sdk/react`).

**Online events can't be catered.** `buildCateringRequest` throws if the venue
has no street address, city and ZIP.

## 3. Registration: the allergy question

When catering is enabled, add `DUNBACK_REGISTRATION_QUESTION` to the event's
registration form:

```ts
import { DUNBACK_REGISTRATION_QUESTION } from "@dunbackmeadow/commerce-sdk";
// { id: "dunback_food_allergies", label: "Food allergies or dietary needs", type: "long_text", required: false, ... }
```

**Consent.** Allergy and diet answers are health information, so Dunback only
accepts them with the guest's consent. The question's description is that
consent: _"By answering, you agree that Dunback Meadow and the restaurant may
use your answer to prepare a safe meal for you."_ Keep this wording, or an
equivalent that names Dunback Meadow and the restaurant, and show it next to
the question.

`toDunbackAttendees()` sends an answer to `dunback_food_allergies` with
`allergyConsent: true`. If a host asks about allergies in their own question
instead, that answer is **not** sent, because the guest didn't see Dunback's
consent wording. Before ordering, call `guestsWithUnsharedAllergies(guests)`
and show the host those names, for example: _"Ana and Ben noted allergies
that Dunback can't check. Confirm their meals with them."_ If the host's own
question has the consent wording too, pass `{ otherQuestionsHaveConsent: true }`
to both helpers.

## 4. "Order Food via Dunback Meadow"

Show the button on the host's event page when
`canOrderFood(settings, event).ok` is true. That requires all three of:

- catering is enabled
- the guest-list deadline has passed (if one is set)
- the event hasn't started

```ts
import { buildCateringRequest } from "@dunbackmeadow/commerce-sdk";

const input = buildCateringRequest({
  event, // Luma event: api_id, name, start_at, timezone, geo_address_json
  guests, // Luma get-guests entries (raw or flattened); only approved/going guests are sent
  settings, // DunbackEventSettings
  host: { name, email, phone },
  extraAttendees: [{ name: host.name }], // optional: hosts eat too
});
const request = await dunback.catering.create(input, {
  idempotencyKey: `luma-${event.api_id}-${clickId}`,
});
```

What is sent per guest: name, and email and phone when Luma has them (both
optional), plus the allergy answer when the guest consented.

- The **restaurant never receives the guest list.** It receives:
  - the dishes and quantities
  - the delivery address and on-site contact, only after payment
  - a delivery note asking for allergy-labelled portions, which names the
    guests with allergies (for example "no peanut for Ana")
- Dunback deletes guest data 30 days after the event. Orders are kept longer
  for accounting, without guest names.

If Luma's guest model differs, build `attendees` yourself:
`{ externalId, name, email?, phone?, allergies?, dietaryPreferences?, allergyConsent? }`.
Set `allergyConsent: true` only for guests who agreed to share their notes.

## 5. Showing the three options

Wait for the `catering.options_ready` webhook, or poll
`dunback.catering.get(id)` while `status === "COMPOSING"`.

| status          | Show                                                            |
| --------------- | --------------------------------------------------------------- |
| `OPTIONS_READY` | `request.options` (up to 3)                                     |
| `NO_OPTIONS`    | "No restaurant can cater this event", plus `unavailableReasons` |
| `FAILED`        | `error.message`, and offer a retry                              |

Each option contains:

| Field                                     | What it holds                                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `title`, `restaurant.name`                | Heading for the card                                                                                                    |
| `items`                                   | Dishes and quantities. `role` is `main` (one per guest), `drink` (one per guest) or `extra` (shared sides and desserts) |
| `allergyCoverage`                         | Which dish each allergy group gets, e.g. "2 guests (no peanut): Veggie Bowl"                                            |
| `unfedGuests`                             | Guests with no dish known to be safe for them. **Always show these to the host.**                                       |
| `price.lines`                             | Food & drinks, delivery, restaurant fees, tax, Dunback fees                                                             |
| `price.totals.card` / `price.totals.usdc` | Totals for each payment method                                                                                          |
| `price.perGuest`                          | Per-guest price                                                                                                         |
| `withinBudget`                            | Present when the host set a budget                                                                                      |
| `restaurant.policies`                     | The restaurant's `minimumOrder`, `maxGuests`, `freeDeliveryOver` (each `null` if none)                                  |
| `freeDeliveryShortfall`                   | Food to add for free delivery, or `null`. A waived fee is a `Free delivery` price line of 0                            |
| `items[].addedForMinimum`                 | A shared dish added to reach the restaurant's minimum order                                                             |
| `items[].serves`                          | A catering tray: people one unit serves (`quantity` counts trays). Restaurants' catering dishes are used first        |
| `orderBy`                                 | Last moment the restaurant can accept the order                                                                         |

`<CateringOptionsPicker>` renders all of the above.

## 6. Selection and payment

```ts
const order = await dunback.catering.select(request.id, {
  optionId,
  payer: { name: host.name, email: host.email }, // pre-fills Stripe Checkout
  successUrl: `https://lu.ma/event/manage/${eventId}?dunback=paid`,
  cancelUrl: `https://lu.ma/event/manage/${eventId}?dunback=cancelled`,
});
```

Show the host two buttons:

- **Pay $X by card**: `order.payment.stripe.checkoutUrl` (Stripe Checkout hosted by Dunback's Stripe account)
- **Pay with USDC**: `order.payment.hostedPaymentUrl` (Dunback page with the exact amount, address, wallet link and tx-hash box)

Or build your own USDC screen from `order.payment.usdc`.

After the Stripe redirect back to `successUrl`, call `dunback.orders.get(order.id)`.
It re-checks Stripe, so it doesn't depend on webhook timing. Then show
`<DunbackOrderStatus>` until the status is `CONFIRMED`.

The payment window is `order.payment.expiresAt`: 60 minutes by default, and
always before the restaurant's order deadline. When it expires, Luma receives
`order.expired`, the catering request goes back to `OPTIONS_READY`, and the
host can choose again.

## 7. Webhooks

```ts
app.post("/webhooks/dunback", express.raw({ type: "application/json" }), (req, res) => {
  const event = verifyWebhook(req.body, req.header("Dunback-Signature"), process.env.DUNBACK_WEBHOOK_SECRET!);
  const lumaEventId = event.data.partnerReference.replace(/^luma:/, "");
  ...
  res.sendStatus(200);
});
```

| Event                    | Suggested Luma behaviour                                                   |
| ------------------------ | -------------------------------------------------------------------------- |
| `catering.options_ready` | Notify the host: "Your catering options are ready"                         |
| `catering.no_options`    | Notify the host, and suggest another cuisine or time                       |
| `order.created`          | (optional) Store the order id                                              |
| `order.payment_failed`   | Show `payment.lastError.message` and keep the pay buttons                  |
| `order.confirmed`        | Show "Catering confirmed" on the event page and email the host             |
| `order.expired`          | Let the host choose again                                                  |
| `order.failed`           | Show the message. The host was refunded (`refund`).                        |
| `order.needs_attention`  | Show "Dunback support is finishing your order". Dunback contacts the host. |
| `order.cancelled`        | Show the cancellation and the refund                                       |

## 8. Cancellation

`dunback.orders.cancel(orderId, reason)` works in two cases:

- **Before payment:** the payment links are cancelled.
- **After confirmation, before the restaurant's order deadline:** the order is
  cancelled at the restaurant and the host is refunded. Card refunds are
  automatic; USDC refunds are sent after review.

After the deadline, the call fails with `cancel_refused`.

## 9. Testing checklist (sandbox)

- [ ] `listCuisines()` returns the sandbox restaurants
- [ ] An event with 20 guests (3 with allergies) produces options whose `allergyCoverage` covers them
- [ ] A guest who noted allergies only in a host's own question is listed by `guestsWithUnsharedAllergies`, and the host sees the warning
- [ ] A guest whose allergy no dish can avoid appears in `unfedGuests`, and the warning is shown
- [ ] Card payment with `4242 4242 4242 4242` leads to `order.confirmed`
- [ ] A declined test card (`4000 0000 0000 0002`) keeps the order `AWAITING_PAYMENT`, and the host can retry
- [ ] A small USDC payment on Polygon is detected. The sandbox uses real Polygon USDC with Dunback's test restaurants.
- [ ] An expired link produces `order.expired`, and the host can choose again
- [ ] A webhook with a bad signature is rejected by Luma
- [ ] A double-clicked "Order Food" creates one request (same Idempotency-Key)

## Support

support@dunbackmeadow.com. Include the `request.id` or `order.id` (`creq_…`, `ord_…`).
