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

1. **Credentials.** Dunback Meadow issues Luma:
   - a test key (`dbk_test_luma_…`) for `https://sandbox.dunbackmeadow.com/api/partner/v1`
   - a live key (`dbk_live_luma_…`) for `https://dunbackmeadow.com/api/partner/v1`
   - a webhook secret (`whsec_…`) for each environment
2. **Send Dunback:**
   - Luma's webhook URL for each environment
   - the hostnames that Stripe success and cancel URLs will use (for example `lu.ma`)
3. **Install the SDK on Luma's servers:**

   ```bash
   npm install @dunbackmeadow/commerce-sdk
   ```

   ```ts
   const dunback = new DunbackClient({
     apiKey: process.env.DUNBACK_API_KEY!,
     baseUrl: process.env.DUNBACK_BASE_URL,
   });
   ```

> The API key gives full ordering power. Keep it server-side. Luma's frontend
> talks only to Luma's backend.

## 2. Event creation: enable catering and pick a cuisine

```ts
// Backend: options for the picker. Cache for a few minutes.
const cuisines = await dunback.listCuisines();
// [{ id: "mexican", label: "Mexican", restaurants: 4 }, ...]
// restaurants === 0 means no restaurant on Dunback serves that cuisine yet.
```

Save the host's choice with the event:

```ts
type DunbackEventSettings = {
  enabled: boolean;
  cuisine: CuisineId; // "american" | "chinese" | "mexican" | ...
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

`toDunbackAttendees()` finds the answer in two ways: by
`question_id === "dunback_food_allergies"`, or, if there is no match, by any
question whose label mentions allergies or diet. Hosts who already ask about
diet don't need a second question.

**Privacy notice for guests.** The question's description tells guests that
their answer is shared with Dunback Meadow and the restaurant. Keep that text,
or an equivalent, so guests know who receives their data.

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

What is sent per guest: name, email, phone and the allergy answer.

- The **restaurant never receives the guest list.** It receives:
  - the dishes and quantities
  - the delivery address and on-site contact, only after payment
  - a delivery note asking for allergy-labelled portions, which names the
    guests with allergies (for example "no peanut for Ana")
- Dunback deletes guest data 30 days after the event.

If Luma's guest model differs, build `attendees` yourself:
`{ externalId, name, email?, phone?, allergies?, dietaryPreferences? }`.

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
- [ ] A guest whose allergy no dish can avoid appears in `unfedGuests`, and the warning is shown
- [ ] Card payment with `4242 4242 4242 4242` leads to `order.confirmed`
- [ ] A declined test card (`4000 0000 0000 0002`) keeps the order `AWAITING_PAYMENT`, and the host can retry
- [ ] A small USDC payment on Polygon is detected. The sandbox uses real Polygon USDC with Dunback's test restaurants.
- [ ] An expired link produces `order.expired`, and the host can choose again
- [ ] A webhook with a bad signature is rejected by Luma
- [ ] A double-clicked "Order Food" creates one request (same Idempotency-Key)

## Support

support@dunbackmeadow.com. Include the `request.id` or `order.id` (`creq_…`, `ord_…`).
