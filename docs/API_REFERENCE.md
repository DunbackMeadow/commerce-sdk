# Dunback Meadow Partner API v1

| | |
| --- | --- |
| Base URL | `https://dunbackmeadow.com/api/partner/v1` |
| Sandbox | `https://sandbox.dunbackmeadow.com/api/partner/v1` |
| Auth | `Authorization: Bearer dbk_live_<appId>_<secret>` (server-to-server only) |
| Keys | Created per app and environment in the Developer Dashboard: <https://dunbackmeadow.com/developer> |
| Format | JSON in and out. Money is in USD; USDC is 1:1. |

Each environment accepts only its own keys: `dbk_test_` in the sandbox,
`dbk_live_` in production. Anything else gets `401 wrong_environment`.

| Status | code | Meaning |
| --- | --- | --- |
| 401 | `unauthorized` | Missing, malformed or deleted key |
| 401 | `wrong_environment` | A key from the other environment |
| 403 | `partner_disabled` | The app was deleted or the account isn't active |

**Errors** use one shape:

```json
{ "error": { "code": "invalid_request", "message": "…", "details": {} } }
```

**Idempotency.** For POST requests, send `Idempotency-Key: <unique>`.
Replays return the original response with `Idempotent-Replayed: true`. Reusing a
key with a different body returns `422 idempotency_mismatch`. Keys are kept for
24 h.

---

## App

### `GET /me`

The app and environment the key belongs to.

```json
{ "object": "app", "id": "app-k3m9x2q7w4ze", "name": "Event catering", "mode": "test",
  "webhookUrl": "https://api.example.com/webhooks/dunback", "allowedReturnHosts": ["example.com"] }
```

---

## Catalog

### `GET /catalog/cuisines`

```json
{ "object": "list", "data": [ { "id": "mexican", "label": "Mexican", "restaurants": 4 } ] }
```

Cuisine ids: `american`, `chinese`, `mexican`, `italian`, `japanese`,
`indian`, `thai`, `mediterranean`, `korean`, `vietnamese`.

---

## Catering requests

### `POST /catering/requests` → `202` CateringRequest (status `COMPOSING`)

| Field | Type | Notes |
| --- | --- | --- |
| `partnerReference` | string, required | Your id, e.g. `luma:evt-AbC123` |
| `event.name` | string, required | |
| `event.startsAt` | ISO 8601, required | Must be in the future |
| `event.timeZone` | IANA, required | Venue time zone |
| `event.url` | URL | |
| `deliveryDeadlineLocal` | `YYYY-MM-DDTHH:mm` | Default: `startsAt` minus 30 min, venue-local |
| `cuisine` | cuisine id, required | |
| `includeDrinks` | bool | Default true. Non-alcoholic only. |
| `budgetPerGuest` | number | Flags options above it |
| `deliveryAddress` | `{address1, address2?, city, state?, zip, country?}`, required | |
| `onsiteContact` | `{name, phone, email?}`, required | Receives the delivery |
| `deliveryNotes` | string | |
| `host` | `{name, email, phone?}`, required | |
| `attendees[]` | 1–300, required | `{externalId?, name, email?, phone?, allergies?, dietaryPreferences?, allergyConsent?}` |

`email` and `phone` are optional for every guest. `allergyConsent: true` is
required for each guest whose `allergies` or `dietaryPreferences` says more than
"none": it records that the guest agreed to share those notes with Dunback and
the restaurant. Otherwise the request fails with `400 allergy_consent_required`,
and `error.details.guests` lists `{ index, externalId, name }` for each guest
concerned.

Composing usually takes 5–30 s. When it finishes, you receive the
`catering.options_ready`, `catering.no_options` or `catering.failed` webhook.

### `GET /catering/requests/:id` → CateringRequest

### `GET /catering/requests?partnerReference=…` → `{ data: CateringRequest[] }` (newest first)

### CateringRequest

| Field | Notes |
| --- | --- |
| `id` | `creq_…` |
| `object` | `"catering_request"` |
| `status` | `COMPOSING`, `OPTIONS_READY`, `NO_OPTIONS`, `SELECTED` or `FAILED` |
| `partnerReference`, `event`, `cuisine`, `guestCount` | As sent; `event` gains `startsAtLocal` |
| `deliveryDeadlineLocal`, `timeZone`, `daypart` | |
| `allergySummary` | `[{ constraint, guests: [names] }]` |
| `options` | Up to 3; see below |
| `unavailableReasons` | `[{ name, reason }]`, when `NO_OPTIONS` |
| `orderId` | Set once an option is selected |
| `error` | `{ code, message }`, when `FAILED` |
| `createdAt`, `updatedAt` | |

Each option:

| Field | Notes |
| --- | --- |
| `id` | `opt_1` … `opt_3` |
| `title` | |
| `strategy` | `favorites`, `value` or `variety` |
| `restaurant` | `{ name, distanceMiles, imageUrl }` |
| `items[]` | `{ name, description, imageUrl, role: "main"\|"drink"\|"extra", quantity, unitPrice, allergens, dietaryTags }` |
| `allergyCoverage[]` | `{ constraint, guests, dishes }` |
| `unfedGuests[]` | `{ constraint, guests: [names], what? }`: guests with no dish known to be safe |
| `price` | See Price |
| `withinBudget` | Present when a budget was set |
| `orderBy` | ISO; latest payment time the restaurant accepts |

### Price

| Field | Notes |
| --- | --- |
| `currency` | `"USD"` |
| `lines[]` | `{ code, label, amount }`. `code` is `food`, `delivery`, `restaurant_fee`, `tax`, `platform_fee` or `service_fee`. |
| `restaurantAmount` | What Dunback pays the restaurant |
| `dunbackCommission` | |
| `dunbackServiceFee` | |
| `totals` | `{ usdc, card, cardProcessingFee }` |
| `perGuest` | `{ usdc, card }` |
| `commissionRate` | |

The card total is the USDC total grossed up for card processing.

### `POST /catering/requests/:id/select` → `201` Order

| Field | Notes |
| --- | --- |
| `optionId` | required |
| `payer` | `{ name?, email? }` (pre-fills Stripe) |
| `paymentMethods` | `["stripe","usdc"]` (default both) |
| `successUrl`, `cancelUrl` | Stripe return URLs: https, on your registered hosts |

Errors:

| Status | code | Meaning |
| --- | --- | --- |
| 409 | `invalid_state` | Already selected, or not ready |
| 409 | `order_deadline_passed` | Too late for the restaurant to make the event time |
| 409 | `restaurant_*` | The restaurant can't take it now |

---

## Orders

### Order

| Field | Notes |
| --- | --- |
| `id` | `ord_…` |
| `object` | `"order"` |
| `status` | `AWAITING_PAYMENT`, `PAID`, `FULFILLING`, `CONFIRMED`, `EXPIRED`, `CANCELLED`, `REFUNDED`, `REFUND_PENDING` or `NEEDS_ATTENTION` |
| `title`, `summary`, `restaurant`, `deliveryDeadlineLocal`, `timeZone`, `guestCount` | |
| `items`, `allergyCoverage`, `unfedGuests`, `price` | Same shapes as the option |
| `payment` | See below |
| `fulfillment` | `{ restaurantOrderIds, providerPayment: { amount, payTo, txHash, verifiedOnChain, network }, confirmedAt }` |
| `refund` | `{ status: "SUCCEEDED"\|"PENDING", method, amount, note? }` |
| `error` | `{ code, message }` |

`payment` holds:

| Field | Notes |
| --- | --- |
| `expiresAt` | ISO |
| `hostedPaymentUrl` | Dunback page offering every method; safe to give the payer |
| `stripe` | `{ checkoutUrl, amount, currency: "usd" }` |
| `usdc.network`, `usdc.chainId` | `"polygon"`, `137` |
| `usdc.asset` | USDC contract on Polygon |
| `usdc.receiver` | Dunback's receiving address |
| `usdc.amount`, `usdc.amountAtomic` | Exact amount, e.g. `"412.380317"` and `"412380317"` |
| `usdc.paymentUri` | `ethereum:…` (EIP-681) |
| `usdc.note` | |
| `usdc.x402Url` | For agents |
| `received` | `{ method: "stripe"\|"usdc"\|"x402", amount, currency, reference, payer?, at }` |
| `lastError` | `{ method, code, message, at }` |

The links (`hostedPaymentUrl`, `stripe`, `usdc`) are present while the status
is `AWAITING_PAYMENT`.

### `GET /orders/:id` → Order

This also re-checks Stripe for open card payments.

### `POST /orders/:id/usdc/confirm` `{ txHash }` → Order

Verifies a Polygon USDC transfer to `payment.usdc.receiver`. The amount must
be ≥ the USDC total; the exact tagged amount isn't required when you supply the
hash. The call waits up to 60 s for the restaurant to confirm.

| Status | code |
| --- | --- |
| 409 | `payment_pending` |
| 400 | `payment_not_found` |
| 400 | `payment_amount_short` |
| 409 | `payment_already_used` |

### `POST /orders/:id/cancel` `{ reason? }` → Order

| Order status | Result |
| --- | --- |
| `AWAITING_PAYMENT` | Cancels the payment links |
| `CONFIRMED`, before the restaurant's deadline | Cancels at the restaurant and refunds |
| Otherwise | `409 cancel_refused` or `409 invalid_state` |

### `POST /orders/:id/pay/x402?t=<token>` (x402 resource; no API key, the URL is `payment.usdc.x402Url`)

1. Without `PAYMENT-SIGNATURE`, the endpoint returns
   `402 Payment Required` with a `PAYMENT-REQUIRED` header: base64 JSON
   `{ x402Version: 2, accepts: [{ scheme: "exact", network: "eip155:137", amount, asset, payTo, maxTimeoutSeconds, extra: { name: "USD Coin", version: "2" } }] }`.
2. Retry with
   `PAYMENT-SIGNATURE: base64({ x402Version: 2, scheme: "exact", network, accepted, payload: { authorization, signature } })`.
   The payload is an EIP-3009 `TransferWithAuthorization`. It is verified and
   settled by Dunback's facilitator.
3. On success the response is `200` with the Order and a `PAYMENT-RESPONSE`
   header. If the payment is rejected, you get `402` with `{ error: { code, message } }`.

---

## Webhooks

`POST` to your URL with this body:

```json
{ "id": "evt_…", "type": "order.confirmed", "created": 1763000000, "data": { … } }
```

The `Dunback-Signature: t=<unix>,v1=<hex>` header is
`HMAC-SHA256(webhookSecret, "<t>.<raw body>")`. Reject anything older than
5 minutes. Answer with a 2xx; anything else is retried after 1 s, 5 s and 25 s.

| Event | `data` |
| --- | --- |
| `catering.options_ready`, `catering.no_options`, `catering.failed` | CateringRequest |
| `order.created`, `order.confirmed`, `order.payment_failed`, `order.expired`, `order.failed`, `order.needs_attention`, `order.cancelled` | Order |
| `ping` | `{ object: "ping", appId, message }`, plus top-level `livemode`. Sent by **Send test event** in the Developer Dashboard. |

The webhook URL, its signing secret (reveal or roll) and the allowed return
hosts are set per app and environment in the Developer Dashboard.
