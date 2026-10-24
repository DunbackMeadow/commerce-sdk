# Changelog

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
