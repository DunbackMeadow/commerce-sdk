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
import type { CateringOption, Cuisine, CuisineId, Order, Price } from "../types.js";
import type { DunbackEventSettings } from "../luma.js";

const money = (n: number) => `$${Number(n || 0).toFixed(2)}`;
const box: React.CSSProperties = { border: "1px solid rgba(127,127,127,.3)", borderRadius: 10, padding: 14 };

// ---------------------------------------------------------------------------

export interface DunbackCateringSettingsProps {
  /** From your backend: dunback.listCuisines(). Cuisines with 0 restaurants are shown disabled. */
  cuisines: Cuisine[];
  value: DunbackEventSettings | null;
  onChange: (next: DunbackEventSettings | null) => void;
  className?: string;
}

export function DunbackCateringSettings({ cuisines, value, onChange, className }: DunbackCateringSettingsProps) {
  const enabled = !!value?.enabled;
  const firstAvailable = cuisines.find((c) => c.restaurants > 0)?.id || "american";
  return (
    <div className={className} style={className ? undefined : box}>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked ? { enabled: true, includeDrinks: true, cuisine: value?.cuisine || firstAvailable } : null)}
        />
        Food &amp; drinks by Dunback Meadow
      </label>
      <p style={{ margin: "6px 0 0", fontSize: 13, opacity: 0.75 }}>
        Guests can note allergies when they register. Once your guest list is final, order catering for everyone in one click.
      </p>
      {enabled && value && (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <label style={{ fontSize: 14 }}>
            Cuisine{" "}
            <select value={value.cuisine} onChange={(e) => onChange({ ...value, cuisine: e.target.value as CuisineId })}>
              {cuisines.map((c) => (
                <option key={c.id} value={c.id} disabled={c.restaurants === 0}>
                  {c.label}{c.restaurants === 0 ? " (not available nearby yet)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 14 }}>
            <input type="checkbox" checked={value.includeDrinks ?? true} onChange={(e) => onChange({ ...value, includeDrinks: e.target.checked })} /> Include drinks
          </label>
          <label style={{ fontSize: 14 }}>
            Budget per guest (optional){" "}
            <input
              type="number" min={1} step={1} style={{ width: 90 }}
              value={value.budgetPerGuest ?? ""}
              onChange={(e) => onChange({ ...value, budgetPerGuest: e.target.value ? Number(e.target.value) : undefined })}
            />
          </label>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function PriceBreakdown({ price, showCard = true }: { price: Price; showCard?: boolean }) {
  return (
    <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
      <tbody>
        {price.lines.map((l) => (
          <tr key={`${l.code}-${l.label}`}><td>{l.label}</td><td style={{ textAlign: "right" }}>{money(l.amount)}</td></tr>
        ))}
        <tr style={{ fontWeight: 700 }}><td>Total (USDC)</td><td style={{ textAlign: "right" }}>{price.totals.usdc.toFixed(2)} USDC</td></tr>
        {showCard && (
          <tr style={{ fontWeight: 700 }}>
            <td>Total (card, incl. {money(price.totals.cardProcessingFee)} processing)</td>
            <td style={{ textAlign: "right" }}>{money(price.totals.card)}</td>
          </tr>
        )}
        <tr style={{ opacity: 0.7 }}><td>Per guest (card)</td><td style={{ textAlign: "right" }}>{money(price.perGuest.card)}</td></tr>
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
              <li key={`${i.role}-${i.name}`}>{i.quantity}× {i.name}{i.role === "extra" ? " (shared)" : ""}</li>
            ))}
          </ul>
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
          {p.hostedPaymentUrl && <a href={p.hostedPaymentUrl}>Pay with USDC or other options</a>}
        </div>
      )}
      {order.status === "AWAITING_PAYMENT" && p.expiresAt && (
        <p style={{ fontSize: 12, opacity: 0.7 }}>Pay by {new Date(p.expiresAt).toLocaleString()} to keep this order.</p>
      )}
    </div>
  );
}
