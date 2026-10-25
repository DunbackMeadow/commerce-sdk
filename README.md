# Dunback Meadow Commerce SDK

`@dunbackmeadow/commerce-sdk` lets your app or agent order **event catering**
from restaurants on Dunback Meadow. More product types will follow. Buyers pay
**by card (Stripe)** or in **USDC on Polygon** (a wallet transfer or x402).

Dunback handles three things:

- **Restaurant selection.** Its catering agent finds restaurants that serve
  the chosen cuisine, deliver to the venue, and can make the event time.
- **Allergy-aware menus.** Each guest gets a dish that is safe for their
  allergies and diet, according to the restaurant's allergen data.
- **Payment and placement.** Dunback verifies the buyer's payment, pays the
  restaurant, and confirms the order back to you.

```
Your app                         Dunback Meadow                         Restaurant agent
────────                         ──────────────                         ────────────────
catering.create(guests) ───────▶ catering agent composes 3 options ───▶ quote_cart (prices)
◀── webhook catering.options_ready (price + fee breakdowns)
catering.select(option) ───────▶ order + payment links
payer pays (card / USDC / x402) ▶ verifies payment (Stripe API / on-chain)
                                 pays restaurant in USDC via x402 ─────▶ books the order
◀── webhook order.confirmed
```

## Install

```bash
npm install @dunbackmeadow/commerce-sdk
```

You need Node 18 or later. React is optional and only needed for `@dunbackmeadow/commerce-sdk/react`.

## Credentials

Get your credentials in the **Dunback Developer Dashboard**
(<https://dunbackmeadow.com/developer>, or Menu → More… → Developer Dashboard
in the Dunback app):

1. Apply for developer access (individual or business). Dunback reviews it,
   usually within 2 business days.
2. Create an **app**. Each app has a **sandbox** and a **production** environment.
3. In each environment, create the **API key** and set your **webhook URL**
   and **allowed return hosts**.

| What | Example | Where it lives |
| --- | --- | --- |
| API key | `dbk_test_app-k3m9x2q7w4ze_…` / `dbk_live_app-k3m9x2q7w4ze_…` | Your servers only. Never put it in a browser or a mobile app. Shown once when created. |
| Webhook signing secret | `whsec_…` | Your servers; used to verify `Dunback-Signature`. One per environment. |
| Allowed return hosts | `lu.ma` | Set in the dashboard; Stripe success and cancel URLs must be on these hosts. |

One key per app and environment at a time: to rotate, delete the key in the
dashboard and create a new one. A deleted key stops working within a minute.

The client picks the environment from the key:

| Key | Base URL |
| --- | --- |
| `dbk_test_…` | `https://sandbox.dunbackmeadow.com/api/partner/v1` |
| `dbk_live_…` | `https://dunbackmeadow.com/api/partner/v1` |

In the sandbox:

- Stripe runs in test mode.
- Orders go to Dunback's test restaurants.
- USDC payments use small real amounts on Polygon. There is no testnet USDC support yet.

Check a key with `await dunback.me()`: it returns the app and environment.

## Quick start

```ts
import { DunbackClient } from "@dunbackmeadow/commerce-sdk";

const dunback = new DunbackClient({ apiKey: process.env.DUNBACK_API_KEY! });

// 1. Send the event and guest list
const request = await dunback.catering.create({
  partnerReference: "luma:evt-AbC123",
  event: { name: "Founders Dinner", startsAt: "2026-11-14T02:00:00Z", timeZone: "America/Los_Angeles" },
  cuisine: "mexican",
  deliveryAddress: { address1: "100 University Ave", city: "Palo Alto", state: "CA", zip: "94301" },
  onsiteContact: { name: "Sam Host", phone: "+14155550100" },
  host: { name: "Sam Host", email: "sam@example.com" },
  attendees: [
    { name: "Ana", email: "ana@example.com", allergies: "peanuts", allergyConsent: true },
    { name: "Ben", phone: "+14155550101", allergies: "" },
    { name: "Cleo", dietaryPreferences: "vegetarian", allergyConsent: true },
  ],
});

// 2. Options are ready in seconds. Use the webhook in production; polling works too.
const ready = await dunback.catering.waitForOptions(request.id);
for (const o of ready.options) {
  console.log(o.title, o.price.totals.card, o.price.lines, o.allergyCoverage, o.unfedGuests);
}

// 3. The host picks one, and you get payment links
const order = await dunback.catering.select(ready.id, { optionId: ready.options[0].id });
order.payment.stripe?.checkoutUrl;  // card: Stripe Checkout
order.payment.usdc;                 // USDC: amount, address, EIP-681 link, x402Url
order.payment.hostedPaymentUrl;     // Dunback page offering both

// 4. Wait for the order.confirmed webhook, or poll
const final = await dunback.orders.waitForSettlement(order.id);
```

## Paying

| Method | Who it suits | How Dunback verifies |
| --- | --- | --- |
| **Card** (`payment.stripe.checkoutUrl`) | People | Signed Stripe webhook, plus a re-read of the Checkout Session: paid, USD, exact amount, this order |
| **USDC transfer** (`payment.usdc`) | People with a wallet, treasury tools | Polygon logs: a transfer of the exact tagged amount to the receiver is matched automatically. You can also call `orders.confirmUsdcPayment(id, txHash)` with any amount ≥ the total. |
| **x402** (`payOrderWithX402`) | Agents | EIP-3009 authorization, verified and settled on-chain by Dunback's x402 facilitator |

The **card total** includes card processing, so it is a little higher than
the **USDC total**. Both are shown in `price.totals`, and the line items are in
`price.lines`.

Payment links expire at `payment.expiresAt`. That is usually 60 minutes, and
always before the restaurant's order deadline. When a link expires, the host
can select an option again to get new links.

### Agent payment with x402

```ts
import { payOrderWithX402 } from "@dunbackmeadow/commerce-sdk";

const paid = await payOrderWithX402(order, {
  address: account.address,
  signTypedData: (td) => account.signTypedData(td),        // viem
  // signTypedData: (td) => wallet.signTypedData(td.domain, td.types, td.message), // ethers v6
}, { maxAmountUsdc: 500 });
// paid.status === "CONFIRMED"
```

### Payment errors

Payment problems come back as `DunbackApiError` with a `code` you can show to the payer:

| code | Meaning |
| --- | --- |
| `payment_pending` | The transaction isn't confirmed yet. Retry in a few seconds. |
| `payment_not_found` | That transaction didn't send USDC to Dunback. |
| `payment_amount_short` | Less than the order total arrived. |
| `payment_already_used` | That transaction already paid another order. |
| `invalid_payment_signature`, `invalid_payment`, `insufficient_funds`, `settlement_failed` | The x402 authorization was rejected. |
| `order_deadline_passed` | It's too late for the restaurant to make the event time. |

`isPaymentError(e)` tells you whether an error is one of these.

Asynchronous card failures, such as a declined bank debit, arrive as the
`order.payment_failed` webhook. `order.payment.lastError` holds the message.

## Correcting the delivery address

Until an order is paid, you (or the payer, on the hosted payment page) can
correct the delivery address, on-site contact and note:

```ts
const updated = await dunback.orders.updateDelivery(order.id, {
  deliveryAddress: { address1: "120 University Ave", address2: "Suite 300", city: "Palo Alto", state: "CA", zip: "94301" },
  onsiteContact: { name: "Sam Lee", phone: "+15550000000" },
  deliveryNotes: "Loading dock on Bryant St.", // replaces the current note
});
// updated.delivery shows the corrected details
```

The price stays as quoted, so the new address must stay within about a mile
of the original and inside the restaurant's delivery area. Otherwise the call
fails with `422 address_moved` or `outside_delivery_area`; create a new
catering request instead. Addresses where Dunback hasn't launched delivery
fail with `422 delivery_area_not_launched`, both here and when you create a
catering request.

## Order lifecycle

```
AWAITING_PAYMENT ─▶ PAID ─▶ FULFILLING ─▶ CONFIRMED ─▶ (CANCELLED)
       │                          ├─▶ REFUNDED / REFUND_PENDING  restaurant couldn't take it; buyer refunded
       │                          └─▶ NEEDS_ATTENTION            Dunback support finishes it by hand
       └─▶ EXPIRED / CANCELLED
```

## Webhooks

```ts
import express from "express";
import { verifyWebhook } from "@dunbackmeadow/commerce-sdk";

app.post("/webhooks/dunback", express.raw({ type: "application/json" }), (req, res) => {
  const event = verifyWebhook(req.body, req.header("Dunback-Signature"), process.env.DUNBACK_WEBHOOK_SECRET!);
  // event.type, event.data (CateringRequest or Order)
  res.sendStatus(200);
});
```

| Event | `data` |
| --- | --- |
| `catering.options_ready`, `catering.no_options`, `catering.failed` | CateringRequest |
| `order.created`, `order.confirmed`, `order.payment_failed`, `order.expired`, `order.failed`, `order.needs_attention`, `order.cancelled`, `order.delivery_updated` | Order |
| `ping` | `{ object: "ping", appId, message }`: sent by **Send test event** in the dashboard |

Each webhook is signed as `t=<unix>,v1=<HMAC-SHA256(secret, "<t>.<body>")>`.
A non-2xx answer is retried after 1 s, 5 s and 25 s. Handle events
idempotently by `event.id`.

## Reliability

- POST helpers send an `Idempotency-Key`. Pass your own (for example, per button
  click) to make retries safe across processes. Dunback keeps keys for 24 h.
- The client retries network errors and 5xx responses for GETs and for POSTs
  that carry an idempotency key.
- `orders.get()` also re-checks Stripe, so it is safe to call right after a
  Checkout redirect.

## Allergies

Guests write allergy notes in their own words. Dunback turns them into
allergens (the US "Big 9" plus a few more) and diets. A dish is offered to a
guest with an allergy only when the restaurant has **declared** that dish's
allergens and none of them match. If no dish is known to be safe for a guest,
the option lists that guest in `unfedGuests` rather than guessing. Show those
warnings to the host. Allergy-labelled portions are requested from the
restaurant in the delivery note.

**Consent.** Allergy and diet notes are health information, so each guest
must agree to share theirs. Send `allergyConsent: true` for every guest whose
`allergies` or `dietaryPreferences` says more than "none". Without it, the
request fails with `400 allergy_consent_required`, and `details.guests` lists
the guests concerned. `toDunbackAttendees()` sets `allergyConsent` for answers
to `DUNBACK_REGISTRATION_QUESTION`, whose wording asks for that consent.

**Retention.** Dunback deletes guest data 30 days after the event. Orders are
kept longer for accounting, without guest names.

## React components (optional)

```tsx
import { DunbackCateringSettings, CateringOptionsPicker, DunbackOrderStatus } from "@dunbackmeadow/commerce-sdk/react";
```

These components only render data. Your backend makes every Dunback call.

## More

- Developer Dashboard and documentation: <https://dunbackmeadow.com/developer>
- [Luma integration guide](docs/LUMA_INTEGRATION_GUIDE.md)
- [API reference](docs/API_REFERENCE.md)
- [examples/luma-integration](examples/luma-integration): Express backend and host panel
- [examples/agent-x402-payment.ts](examples/agent-x402-payment.ts): an agent ordering and paying with x402

## License

MIT
