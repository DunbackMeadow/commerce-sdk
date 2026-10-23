/**
 * Helpers for the Luma integration:
 *
 *   1. Event creation: the host turns on "Food & drinks by Dunback Meadow" and
 *      picks a cuisine  -> store a DunbackEventSettings with the event.
 *   2. Registration: add DUNBACK_REGISTRATION_QUESTION to the event's form, so
 *      guests can note allergies.
 *   3. After the guest list is final: "Order Food via Dunback Meadow" ->
 *      buildCateringRequest(event, guests, settings) -> dunback.catering.create().
 *
 * The Luma shapes below follow Luma's public API (event + get-guests). The
 * mapper also accepts flat objects, so it works with internal models too:
 * pass whatever has the same field names, or map to `Attendee` yourself.
 */

import type { Address, Attendee, CateringRequestInput, CuisineId } from "./types.js";

/** Stored with a Luma event when the host enables Dunback catering. */
export interface DunbackEventSettings {
  enabled: boolean;
  cuisine: CuisineId;
  includeDrinks?: boolean;
  budgetPerGuest?: number;
  /** When the host's guest list is final; "Order Food" is offered from then on. ISO 8601. */
  guestListDeadline?: string;
  /** Override the default (30 min before start). Venue-local "YYYY-MM-DDTHH:mm". */
  deliveryDeadlineLocal?: string;
  deliveryNotes?: string;
  onsiteContact?: { name: string; phone: string; email?: string };
}

/** The registration question to add to events with Dunback catering enabled. */
export const DUNBACK_REGISTRATION_QUESTION = {
  id: "dunback_food_allergies",
  label: "Food allergies or dietary needs",
  description: "Shared with Dunback Meadow and the restaurant so your meal is safe for you. Leave blank if none.",
  type: "long_text" as const,
  required: false,
  placeholder: "e.g. peanuts, shellfish, vegetarian, celiac",
};

export interface LumaEventLike {
  api_id?: string;
  id?: string;
  name: string;
  start_at: string;
  timezone: string;
  url?: string;
  geo_address_json?: {
    address?: string;
    full_address?: string;
    city?: string;
    region?: string;
    postal_code?: string;
    country?: string;
    country_code?: string;
  } | null;
}

export interface LumaGuestLike {
  api_id?: string;
  id?: string;
  user_name?: string | null;
  name?: string | null;
  user_email?: string | null;
  email?: string | null;
  phone_number?: string | null;
  approval_status?: string | null;
  checked_in_at?: string | null;
  registration_answers?: Array<{ question_id?: string; label?: string; answer?: unknown; value?: unknown }> | null;
}

/** Guest statuses that count as attending. */
export const ATTENDING_STATUSES = new Set(["approved", "going", "checked_in", "confirmed"]);

const ALLERGY_LABEL_RE = /allerg|dietary|diet|food restriction/i;

function answerText(a: { answer?: unknown; value?: unknown }): string {
  const v = a.answer ?? a.value;
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

/** Luma guests (raw get-guests entries or flat) -> Dunback attendees, attending guests only. */
export function toDunbackAttendees(
  guests: Array<LumaGuestLike | { guest: LumaGuestLike }>,
  { questionId = DUNBACK_REGISTRATION_QUESTION.id, includeStatuses = ATTENDING_STATUSES }: { questionId?: string; includeStatuses?: Set<string> } = {},
): Attendee[] {
  return guests
    .map((g) => ("guest" in g && g.guest ? g.guest : (g as LumaGuestLike)))
    .filter((g) => !g.approval_status || includeStatuses.has(String(g.approval_status).toLowerCase()))
    .map((g) => {
      const answers = g.registration_answers || [];
      const allergy = answers.find((a) => a.question_id === questionId) || answers.find((a) => ALLERGY_LABEL_RE.test(a.label || ""));
      const name = (g.user_name || g.name || g.user_email || g.email || "Guest").trim();
      const a: Attendee = { externalId: g.api_id || g.id, name, allergies: allergy ? answerText(allergy).slice(0, 500) : "" };
      const email = g.user_email || g.email;
      if (email) a.email = email;
      if (g.phone_number) a.phone = g.phone_number;
      return a;
    });
}

/** Luma's geo_address_json -> Dunback address. Throws if the venue has no street address. */
export function toDunbackAddress(geo: LumaEventLike["geo_address_json"]): Address {
  if (!geo?.address || !geo.city || !geo.postal_code) {
    throw new Error("Dunback catering needs a street address, city and ZIP for the venue (online events can't be catered).");
  }
  return {
    address1: geo.address,
    city: geo.city,
    state: geo.region || "",
    zip: geo.postal_code,
    country: (geo.country_code || "US").toUpperCase().slice(0, 2),
  };
}

export interface BuildCateringRequestArgs {
  event: LumaEventLike;
  guests: Array<LumaGuestLike | { guest: LumaGuestLike }>;
  settings: DunbackEventSettings;
  host: { name: string; email: string; phone?: string };
  /** Defaults to settings.onsiteContact, else the host (needs a phone). */
  onsiteContact?: { name: string; phone: string; email?: string };
  /** Overrides toDunbackAddress(event.geo_address_json). */
  deliveryAddress?: Address;
  /** Hosts and co-hosts eat too: add them as attendees. */
  extraAttendees?: Attendee[];
}

/** Everything Dunback needs for a Luma event's catering request. */
export function buildCateringRequest(args: BuildCateringRequestArgs): CateringRequestInput {
  const { event, guests, settings, host } = args;
  if (!settings?.enabled) throw new Error("Dunback catering is not enabled for this event.");
  const onsite = args.onsiteContact || settings.onsiteContact || (host.phone ? { name: host.name, phone: host.phone, email: host.email } : null);
  if (!onsite) throw new Error("An on-site contact with a phone number is required for delivery.");
  const attendees = [...toDunbackAttendees(guests), ...(args.extraAttendees || [])];
  if (!attendees.length) throw new Error("The event has no attending guests yet.");

  return {
    partnerReference: `luma:${event.api_id || event.id}`,
    event: { name: event.name, startsAt: event.start_at, timeZone: event.timezone, ...(event.url ? { url: event.url } : {}) },
    ...(settings.deliveryDeadlineLocal ? { deliveryDeadlineLocal: settings.deliveryDeadlineLocal } : {}),
    cuisine: settings.cuisine,
    includeDrinks: settings.includeDrinks ?? true,
    ...(settings.budgetPerGuest ? { budgetPerGuest: settings.budgetPerGuest } : {}),
    deliveryAddress: args.deliveryAddress || toDunbackAddress(event.geo_address_json),
    onsiteContact: onsite,
    deliveryNotes: settings.deliveryNotes || "",
    host,
    attendees,
  };
}

/** Whether to show "Order Food via Dunback Meadow" on the host's event page. */
export function canOrderFood(settings: DunbackEventSettings | null | undefined, event: Pick<LumaEventLike, "start_at">, now = new Date()): { ok: boolean; reason?: string } {
  if (!settings?.enabled) return { ok: false, reason: "Dunback catering is off for this event." };
  if (Date.parse(event.start_at) <= now.getTime()) return { ok: false, reason: "The event has started." };
  if (settings.guestListDeadline && Date.parse(settings.guestListDeadline) > now.getTime()) {
    return { ok: false, reason: "The guest list isn't final yet." };
  }
  return { ok: true };
}
