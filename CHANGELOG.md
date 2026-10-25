# Changelog

## Unreleased (API change, no SDK code change)

- Catering requests accept up to 1000 guests (was 300). More fails with
  `400 invalid_request`.
- No per-dish quantity limit: an option lists each dish once with the full
  quantity (`items[].quantity`), however many guests it feeds.

## 0.4.0

- New `orders.updateDelivery(orderId, { deliveryAddress, onsiteContact?, deliveryNotes? })`
  (`POST /orders/:id/delivery`): correct the delivery details while the order
  is `AWAITING_PAYMENT`. Fails with `422 address_moved`,
  `outside_delivery_area` or `delivery_area_not_launched` when the address
  can't be served at the quoted price.
- `Order.delivery`: the delivery address, on-site contact, your delivery note
  and whether they can still be edited (`OrderDelivery`).
- New webhook event `order.delivery_updated`.
- `catering.create` fails with `422 delivery_area_not_launched` for addresses
  outside the areas where Dunback has launched delivery.

## 0.3.0

- **Breaking:** guests with allergy or diet notes need `allergyConsent: true`.
  Without it, `catering.create` fails with `400 allergy_consent_required`, and
  `details.guests` lists `{ index, externalId, name }` for each guest concerned.
- `toDunbackAttendees()` sends an allergy answer only with consent: an answer to
  `DUNBACK_REGISTRATION_QUESTION`, whose description now asks for it. Answers
  to a host's own allergy question are left out unless you pass
  `{ otherQuestionsHaveConsent: true }`.
- New `guestsWithUnsharedAllergies(guests)`: guests whose allergy answers were
  left out, so you can warn the host.
- Docs: guest email and phone are optional. Guest data is deleted 30 days
  after the event; orders are kept without guest names.

## 0.2.0

- API keys now come from the Dunback Developer Dashboard
  (<https://dunbackmeadow.com/developer>): one app per product, with one
  sandbox key and one production key each. Keys look like
  `dbk_test_<appId>_…` / `dbk_live_<appId>_…`.
- `DunbackClient` picks the base URL from the key: the sandbox for
  `dbk_test_`, production for `dbk_live_`. `baseUrl` still overrides it.
- New `client.mode` and `client.appId`, read from the key.
- New `client.me()` (`GET /me`): the app and environment a key belongs to.
- New `ping` webhook event, sent by **Send test event** in the dashboard
  (`PingData`, `WebhookEvent.livemode`).
- Exported `DEFAULT_BASE_URL` and `SANDBOX_BASE_URL`.
- Malformed keys are rejected when the client is created.

## 0.1.0

- First release: catering requests, orders, Stripe / USDC / x402 payments,
  webhook verification, Luma helpers and React components.
