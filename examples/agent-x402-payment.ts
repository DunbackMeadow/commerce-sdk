/**
 * An external agent ordering catering and paying in USDC with x402.
 *
 *   DUNBACK_API_KEY=dbk_test_... AGENT_PRIVATE_KEY=0x... npx tsx agent-x402-payment.ts
 */
import { privateKeyToAccount } from "viem/accounts";
import { DunbackClient, payOrderWithX402 } from "@dunbackmeadow/commerce-sdk";

const dunback = new DunbackClient({ apiKey: process.env.DUNBACK_API_KEY! });
const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`);

const request = await dunback.catering.create({
  partnerReference: `agent:${Date.now()}`,
  event: { name: "Team offsite lunch", startsAt: "2026-11-20T20:00:00Z", timeZone: "America/Los_Angeles" },
  cuisine: "mediterranean",
  deliveryAddress: { address1: "100 University Ave", city: "Palo Alto", state: "CA", zip: "94301" },
  onsiteContact: { name: "Front desk", phone: "+14155550100" },
  host: { name: "Ops Agent", email: "ops@example.com" },
  attendees: [{ name: "Ana", allergies: "sesame" }, { name: "Ben" }, { name: "Cleo", dietaryPreferences: "vegan" }],
});

const ready = await dunback.catering.waitForOptions(request.id);
if (ready.status !== "OPTIONS_READY") throw new Error(`No options: ${JSON.stringify(ready.unavailableReasons || ready.error)}`);

// Cheapest option that feeds everyone safely.
const option = [...ready.options].filter((o) => !o.unfedGuests.length).sort((a, b) => a.price.totals.usdc - b.price.totals.usdc)[0];
if (!option) throw new Error("No option covers every guest's allergies.");

const order = await dunback.catering.select(ready.id, { optionId: option.id, paymentMethods: ["usdc"] });
const result = await payOrderWithX402(order, {
  address: account.address,
  signTypedData: (td) => account.signTypedData(td),
}, { maxAmountUsdc: option.price.totals.usdc + 1 });

console.log(result.status, result.fulfillment?.restaurantOrderIds);
