/**
 * Optional, unstyled-by-default React building blocks for the three Luma
 * touchpoints. They only render data: every call to Dunback goes through YOUR
 * backend (the API key must never reach a browser).
 *
 *   <DunbackCateringSettings>  event creation: enable + choose a cuisine
 *   <CateringOptionsPicker>    host picks one of the 3 options
 *   <DunbackOrderStatus>       payment links and order progress
 *
 * Style with `className` / `classNames`, or wrap them in your own components.
 */

import React, { useState } from "react";
import type { CateringOption, CateringServiceStyle, Cuisine, CuisineId, Order, Price } from "../types.js";
import type { DunbackEventSettings } from "../luma.js";

const money = (n: number) => `$${Number(n || 0).toFixed(2)}`;
const SERVICE_STYLES: Array<{ id: CateringServiceStyle; label: string; hint: string }> = [
  { id: "meal_boxes", label: "Individual meal boxes", hint: "(one packed meal per guest; guests pick their own)" },
  { id: "buffet", label: "Buffet", hint: "(trays and platters to share)" },
];

/** 24 -> "24 hours", 72 -> "3 days". */
const noticeText = (h: number) => (h >= 48 && h % 24 === 0 ? `${h / 24} days` : `${h} hours`);
const box: React.CSSProperties = { border: "1px solid rgba(127,127,127,.3)", borderRadius: 10, padding: 14 };

// Explicit sizes so a host page's global CSS (e.g. `input { width: 100% }`)
// can't stretch the checkboxes or the inputs out of line.
const checkbox: React.CSSProperties = {
  width: 16, height: 16, minWidth: 16, margin: 0, padding: 0, flex: "0 0 auto", cursor: "pointer", boxSizing: "border-box",
};
const checkRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, margin: 0, cursor: "pointer", fontSize: 14 };
const field: React.CSSProperties = { display: "grid", gap: 4, margin: 0, fontSize: 14, fontWeight: 500 };
const control: React.CSSProperties = { boxSizing: "border-box", width: "100%", maxWidth: 280, font: "inherit", fontWeight: 400 };
const hint: React.CSSProperties = { fontSize: 12.5, fontWeight: 400, opacity: 0.7 };

// ---------------------------------------------------------------------------

export interface DunbackCateringSettingsProps {
  /**
   * From your backend: dunback.listCuisines(venue) with the event's venue
   * (toVenueLocation), so counts cover restaurants in its metro area.
   * Cuisines with 0 restaurants are shown disabled.
   */
  cuisines: Cuisine[];
  value: DunbackEventSettings | null;
  onChange: (next: DunbackEventSettings | null) => void;
  /**
   * false while the host hasn't entered the venue address: availability isn't
   * shown, every cuisine can be picked, and the host is asked for the address.
   * Leave undefined if you call listCuisines() without a venue (platform-wide counts).
   */
  venueReady?: boolean;
  /** cuisineCatalog(venue).metro?.name: the area the counts are for. */
  metroName?: string | null;
  /**
   * Shows an "Expected guests" field (value.expectedGuests). Re-fetch
   * listCuisines(venue, { guests: value.expectedGuests, serviceStyle: value.serviceStyle })
   * when either changes, so the counts only include restaurants that cater
   * that many, in that style. Default true.
   */
  askExpectedGuests?: boolean;
  className?: string;
}

export function DunbackCateringSettings({ cuisines, value, onChange, venueReady, metroName, askExpectedGuests = true, className }: DunbackCateringSettingsProps) {
  const enabled = !!value?.enabled;
  const showAvailability = venueReady !== false;
  const firstAvailable = (showAvailability ? cuisines.find((c) => c.restaurants > 0)?.id : null) || cuisines[0]?.id || "american";
  // With a venue the counts are local; without venueReady they are platform-wide.
  const guests = value?.expectedGuests;
  const none = guests && showAvailability
    ? ` (none for ${guests} guests)`
    : venueReady === true ? " (none near this venue yet)" : " (no restaurants yet)";
  const availabilityNote =
    venueReady === false
      ? "Enter the venue's street address, city and ZIP to see which cuisines restaurants near your event offer."
      : venueReady === true && cuisines.length && cuisines.every((c) => c.restaurants === 0)
        ? guests
          ? `No restaurants near this venue cater for ${guests} guests yet. Try a smaller expected guest count.`
          : "Dunback doesn't have restaurants that can cater at this venue yet."
        : metroName
          ? `Restaurant counts are for this metro area: ${metroName}${guests ? `, for about ${guests} guests` : ""}.`
          : null;
  // Restaurants' own cuisines ("Peruvian") go in their own group after the standard ones.
  const custom = cuisines.filter((c) => c.custom);
  const ahead = (c: Cuisine) => (c.noticeHours ? ` · order ${noticeText(c.noticeHours)} ahead` : "");
  const option = (c: Cuisine) => (
    <option key={c.id} value={c.id} disabled={showAvailability && c.restaurants === 0}>
      {c.label}
      {showAvailability ? (c.restaurants === 0 ? none : ` (${c.restaurants} restaurant${c.restaurants === 1 ? "" : "s"}${ahead(c)})`) : ""}
    </option>
  );
  const picked = cuisines.find((c) => c.id === value?.cuisine);
  const labelOf = (id: string) =>
    id.startsWith("custom:") ? id.slice(7).split("-").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") : id;
  return (
    <div className={className} style={className ? undefined : box}>
      <label style={{ ...checkRow, alignItems: "flex-start", gap: 10 }}>
        <input
          type="checkbox"
          style={{ ...checkbox, marginTop: 3 }}
          checked={enabled}
          onChange={(e) => onChange(e.target.checked ? { enabled: true, includeDrinks: true, serviceStyle: "meal_boxes", cuisine: value?.cuisine || firstAvailable } : null)}
        />
        <span style={{ display: "grid", gap: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Food &amp; drinks by Dunback Meadow</span>
          <span style={{ fontSize: 13, opacity: 0.75 }}>
            Guests can note allergies when they register. Once your guest list is final, order catering for everyone in one click.
          </span>
        </span>
      </label>
      {enabled && value && (
        // Indented to line up with the title above (checkbox 16 + gap 10).
        <div style={{ display: "grid", gap: 14, marginTop: 14, paddingLeft: 26 }}>
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 6 }}>
            <legend style={{ ...field, padding: 0, marginBottom: 4 }}>How should food be served?</legend>
            {SERVICE_STYLES.map((s) => (
              <label key={s.id} style={{ ...checkRow, alignItems: "flex-start" }}>
                <input
                  type="radio"
                  name="dunback-service-style"
                  style={{ ...checkbox, marginTop: 2 }}
                  checked={(value.serviceStyle ?? "meal_boxes") === s.id}
                  onChange={() => onChange({ ...value, serviceStyle: s.id })}
                />
                <span>{s.label} <span style={hint}>{s.hint}</span></span>
              </label>
            ))}
          </fieldset>
          <label style={field}>
            Cuisine
            <select style={control} value={value.cuisine} onChange={(e) => onChange({ ...value, cuisine: e.target.value as CuisineId })}>
              {cuisines.filter((c) => !c.custom).map(option)}
              {custom.length > 0 && (
                <optgroup label={venueReady === true ? "More cuisines near this venue" : "More cuisines"}>
                  {custom.map(option)}
                </optgroup>
              )}
              {/* A saved choice no longer offered here (e.g. a custom cuisine after the venue changed). */}
              {!cuisines.some((c) => c.id === value.cuisine) && (
                <option value={value.cuisine} disabled>{labelOf(value.cuisine)}{none}</option>
              )}
            </select>
            {showAvailability && picked?.noticeHours ? (
              <span style={hint}>
                Restaurants need at least {noticeText(picked.noticeHours)} notice for {guests} guests: close the guest list and order by then.
              </span>
            ) : null}
            {availabilityNote && (
              <span role={venueReady === false ? "note" : undefined} style={venueReady === false ? { ...hint, opacity: 1, color: "#b45309" } : hint}>
                {availabilityNote}
              </span>
            )}
          </label>
          {askExpectedGuests && (
            <label style={field}>
              <span>Expected guests <span style={hint}>(optional)</span></span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400 }}>
                <input
                  type="number" min={1} step={1} style={{ ...control, width: 110 }}
                  value={value.expectedGuests ?? ""}
                  onChange={(e) => {
                    const n = Math.floor(Number(e.target.value));
                    onChange({ ...value, expectedGuests: e.target.value && n >= 1 ? n : undefined });
                  }}
                />
                <span style={hint}>Some restaurants limit party size or have a minimum order</span>
              </span>
            </label>
          )}
          <label style={checkRow}>
            <input
              type="checkbox"
              style={checkbox}
              checked={value.includeDrinks ?? true}
              onChange={(e) => onChange({ ...value, includeDrinks: e.target.checked })}
            />
            <span>Include drinks <span style={hint}>(non-alcoholic, one per guest)</span></span>
          </label>
          <label style={field}>
            <span>Budget per guest <span style={hint}>(optional)</span></span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400 }}>
              $
              <input
                type="number" min={1} step={1} style={{ ...control, width: 110 }}
                value={value.budgetPerGuest ?? ""}
                onChange={(e) => onChange({ ...value, budgetPerGuest: e.target.value ? Number(e.target.value) : undefined })}
              />
              <span style={hint}>USD; pricier options are flagged</span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export interface PriceBreakdownProps {
  price: Price;
  /**
   * The payment method the totals are for. "card" (default): dollar amounts,
   * with card processing as its own line. "usdc": only for a host who chose
   * to pay in USDC; the total is then shown in USDC.
   */
  paymentMethod?: "card" | "usdc";
  /** @deprecated Use paymentMethod. `showCard={false}` is the same as paymentMethod="usdc". */
  showCard?: boolean;
}

export function PriceBreakdown({ price, paymentMethod, showCard }: PriceBreakdownProps) {
  const usdc = (paymentMethod ?? (showCard === false ? "usdc" : "card")) === "usdc";
  const right: React.CSSProperties = { textAlign: "right" };
  return (
    <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
      <tbody>
        {price.lines.map((l) => (
          <tr key={`${l.code}-${l.label}`} title={l.note}><td>{l.label}</td><td style={right}>{money(l.amount)}</td></tr>
        ))}
        {!usdc && price.totals.cardProcessingFee > 0 && (
          <tr><td>Card processing</td><td style={right}>{money(price.totals.cardProcessingFee)}</td></tr>
        )}
        <tr style={{ fontWeight: 700 }}>
          <td>Total</td>
          <td style={right}>{usdc ? `${price.totals.usdc.toFixed(2)} USDC` : money(price.totals.card)}</td>
        </tr>
        <tr style={{ opacity: 0.7 }}>
          <td>Per guest</td>
          <td style={right}>{usdc ? `${price.perGuest.usdc.toFixed(2)} USDC` : money(price.perGuest.card)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export interface CateringOptionsPickerProps {
  options: CateringOption[];
  onSelect: (optionId: string) => void | Promise<void>;
  busyOptionId?: string | null;
  className?: string;
}

export function CateringOptionsPicker({ options, onSelect, busyOptionId, className }: CateringOptionsPickerProps) {
  const [open, setOpen] = useState<string | null>(options[0]?.id ?? null);
  if (!options.length) return <p>No catering options are available for this event.</p>;
  return (
    <div className={className} style={{ display: "grid", gap: 12 }}>
      {options.map((o) => (
        <div key={o.id} style={box}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
            <strong>{o.title}</strong>
            <span>{money(o.price.totals.card)} <small style={{ opacity: 0.7 }}>({money(o.price.perGuest.card)}/guest)</small></span>
          </div>
          {o.withinBudget === false && <p style={{ color: "#b45309", fontSize: 13, margin: "4px 0" }}>Above your budget per guest.</p>}
          <ul style={{ margin: "8px 0", paddingLeft: 18, fontSize: 14 }}>
            {o.items.map((i) => (
              <li key={`${i.role}-${i.name}`}>
                {i.quantity}× {i.name}{i.serves ? ` (serves ${i.serves} each)` : ""}{i.role === "extra" ? " (shared)" : ""}
                {i.addedForMinimum && <small style={{ opacity: 0.7 }}> — added to reach the restaurant's {money(o.restaurant.policies?.minimumOrder ?? 0)} minimum</small>}
              </li>
            ))}
          </ul>
          {o.price.lines.some((l) => l.code === "delivery" && l.amount === 0) && (
            <p style={{ fontSize: 13, margin: "2px 0", color: "#15803d" }}>Free delivery</p>
          )}
          {o.freeDeliveryShortfall != null && o.freeDeliveryShortfall > 0 && (
            <p style={{ fontSize: 13, margin: "2px 0", opacity: 0.8 }}>
              Add {money(o.freeDeliveryShortfall)} of food for free delivery ({o.restaurant.name} delivers free on orders of {money(o.restaurant.policies?.freeDeliveryOver ?? 0)} or more).
            </p>
          )}
          {o.allergyCoverage.filter((c) => c.constraint !== "no restrictions").map((c) => (
            <p key={c.constraint} style={{ fontSize: 13, margin: "2px 0" }}>✓ {c.guests} guest{c.guests > 1 ? "s" : ""} ({c.constraint}): {c.dishes.join(", ")}</p>
          ))}
          {o.unfedGuests.map((u) => (
            <p key={`${u.constraint}-${u.what || "main"}`} style={{ fontSize: 13, margin: "2px 0", color: "#b91c1c" }}>
              ⚠ No {u.what === "drink" ? "drink" : "dish"} on this menu is confirmed safe for {u.guests.join(", ")} ({u.constraint}).
            </p>
          ))}
          <button type="button" onClick={() => setOpen(open === o.id ? null : o.id)} style={{ fontSize: 13, background: "none", border: 0, padding: 0, textDecoration: "underline", cursor: "pointer" }}>
            {open === o.id ? "Hide" : "Show"} price breakdown
          </button>
          {open === o.id && <PriceBreakdown price={o.price} />}
          <div style={{ marginTop: 10 }}>
            <button type="button" disabled={!!busyOptionId} onClick={() => onSelect(o.id)}>
              {busyOptionId === o.id ? "Preparing payment…" : "Choose this option"}
            </button>
          </div>
        </div>
      ))}
      <p style={{ fontSize: 12, opacity: 0.7 }}>
        Allergy matching uses the restaurant's allergen information. Labelled portions are requested for guests with allergies; guests with severe allergies should confirm with the restaurant.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

const STATUS: Record<string, string> = {
  AWAITING_PAYMENT: "Waiting for payment",
  PAID: "Payment received, placing the order…",
  FULFILLING: "Payment received, placing the order…",
  CONFIRMED: "Confirmed by the restaurant",
  EXPIRED: "Payment link expired",
  CANCELLED: "Cancelled",
  REFUNDED: "The restaurant couldn't take the order; payment refunded",
  REFUND_PENDING: "The restaurant couldn't take the order; refund in progress",
  NEEDS_ATTENTION: "Payment received; Dunback support is finishing the order",
};

export function DunbackOrderStatus({ order, className }: { order: Order; className?: string }) {
  const p = order.payment;
  return (
    <div className={className} style={className ? undefined : box}>
      <strong>{order.title}</strong>
      <p style={{ margin: "4px 0" }}>{STATUS[order.status] || order.status}</p>
      {p.lastError && <p style={{ color: "#b91c1c", fontSize: 13 }}>{p.lastError.message}</p>}
      {order.error && order.status !== "CONFIRMED" && <p style={{ color: "#b91c1c", fontSize: 13 }}>{order.error.message}</p>}
      {order.status === "AWAITING_PAYMENT" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {p.stripe && <a href={p.stripe.checkoutUrl}>Pay {money(p.stripe.amount)} by card</a>}
          {p.hostedPaymentUrl && <a href={p.hostedPaymentUrl}>Other payment options</a>}
        </div>
      )}
      {order.status === "AWAITING_PAYMENT" && p.expiresAt && (
        <p style={{ fontSize: 12, opacity: 0.7 }}>Pay by {new Date(p.expiresAt).toLocaleString()} to keep this order.</p>
      )}
    </div>
  );
}
