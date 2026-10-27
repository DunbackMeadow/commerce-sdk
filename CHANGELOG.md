# Changelog

## Unreleased

- Hosts see dollars, not USDC: `<PriceBreakdown>` shows "Card processing" and
  "Total $50.45" by default, and USDC totals only with `paymentMethod="usdc"`
  (for a host who chose USDC). `showCard` is deprecated (`showCard={false}`
  means `paymentMethod="usdc"`). `<DunbackOrderStatus>` links to "Other payment
  options" instead of "Pay with USDC or other options".
- Service style: `serviceStyle: "buffet" | "meal_boxes"` on catering requests
  (default `meal_boxes`), echoed on requests and options. Buffets use
  restaurants' catering trays; meal boxes use single portions from any
  restaurant that packs them. `listCuisines(venue, { serviceStyle })` counts per
  style; `DunbackEventSettings.serviceStyle`, sent by `buildCateringRequest()`;
  `<DunbackCateringSettings>` asks for it. New reason codes `no_buffet_dishes`
  and `style_not_offered`.
- Fix: `<CateringOptionsPicker>` and `<PriceBreakdown>` amounts lost their `$`
  sign in an earlier unreleased change.
- Restaurant catering policies. Restaurants can set the most guests they cater
  for, a minimum order and free delivery over an amount; Dunback only offers
  options that meet them.
  - `listCuisines(venue, { guests })` / `cuisineCatalog(venue, { guests })`:
    with the expected guest count, counts include only restaurants able to
    cater that many (`GET /catalog/cuisines?guests=`). The catalog returns
    `guests`.
  - Options gain `restaurant.policies` (`minimumOrder`, `maxGuests`,
    `freeDeliveryOver`) and `freeDeliveryShortfall`; items added to reach a
    minimum have `addedForMinimum: true`; a waived delivery fee is a
    `Free delivery` price line of 0 with a `note`.
  - `unavailableReasons[]` gain a `code` (`party_too_large`,
    `below_minimum_order`, ...).
  - `DunbackEventSettings.expectedGuests`; `<DunbackCateringSettings>` asks
    for it (turn off with `askExpectedGuests={false}`), and
    `<CateringOptionsPicker>` shows free delivery and minimum top-ups.
  - Advance notice by party size: `restaurant.policies.noticeTiers`, a
    per-cuisine `noticeHours` (with `guests`), and the reason code
    `notice_too_short`. `orderBy` already includes the notice.
    `<DunbackCateringSettings>` shows how early to order.
- Catering dishes: restaurants' trays and platters are used first. Such items
  have `serves` (people per unit; `quantity` counts trays), shown as
  "(serves 8 each)" by `<CateringOptionsPicker>`.
- Catering requests accept up to 1000 guests (was 300). More fails with
  `400 invalid_request`. (API change)
- No per-dish quantity limit: an option lists each dish once with the full
  quantity (`items[].quantity`), however many guests it feeds. (API change)
- `<DunbackCateringSettings>`: cleaner layout (description under the title,
  settings indented beneath it, labels above the fields). Checkboxes and inputs
  now have explicit sizes, so a host page's global CSS such as
  `input { width: 100% }` no longer pushes them out of line.
- Cuisine availability near the venue: `listCuisines(venue?)` and the new
  `cuisineCatalog(venue?)` (which also returns `scope` and the venue's `metro`)
  pass the venue (`city`, `state`, `zip`) to `GET /catalog/cuisines`, which
  then counts only restaurants in the venue's metro area. Without a venue,
  counts stay platform-wide, as before.
- New `toVenueLocation(geo_address_json)`: the venue for those calls, or
  `null` until the host has entered a street address, city and ZIP.
- `<DunbackCateringSettings>`: new `venueReady` and `metroName` props. With
  `venueReady={false}` it shows no availability and asks the host to enter the
  venue address first. Otherwise each cuisine shows its restaurant count, and
  the ones without restaurants are disabled.
- Restaurants' own cuisines: the catalog also lists cuisines restaurants
  declared themselves, as `custom:<name>` ids (e.g. `custom:peruvian`, label
  "Peruvian", `custom: true`), where at least one restaurant serves them.
  `CuisineId` now accepts them (`StandardCuisineId | CustomCuisineId`), and so
  does `catering.create({ cuisine })`. `<DunbackCateringSettings>` lists them
  under "More cuisines near this venue".

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
