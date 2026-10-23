/**
 * Host's event page panel (Luma frontend). Talks only to Luma's backend
 * (see server.ts); the Dunback API key stays server-side.
 */
import React, { useEffect, useState } from "react";
import { CateringOptionsPicker, DunbackOrderStatus } from "@dunbackmeadow/commerce-sdk/react";
import type { CateringRequest, Order } from "@dunbackmeadow/commerce-sdk";

type State = { canOrder: { ok: boolean; reason?: string }; request: CateringRequest | null; order: Order | null };

export function HostCateringPanel({ eventId }: { eventId: string }) {
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const load = () => fetch(`/api/events/${eventId}/dunback`).then((r) => r.json()).then(setS);

  useEffect(() => { load(); }, [eventId]);
  // Poll while Dunback is composing or the order is in flight.
  useEffect(() => {
    const live = s?.request?.status === "COMPOSING" || ["AWAITING_PAYMENT", "PAID", "FULFILLING"].includes(s?.order?.status || "");
    if (!live) return;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [s]);

  const post = async (path: string, body: object, key: string) => {
    setBusy(key); setError("");
    const r = await fetch(`/api/events/${eventId}/dunback/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) setError((await r.json()).message);
    setBusy(null);
    load();
  };

  if (!s) return null;
  if (s.order && s.order.status !== "EXPIRED" && s.order.status !== "CANCELLED") return <DunbackOrderStatus order={s.order} />;
  if (s.request?.status === "COMPOSING") return <p>Dunback is putting together catering options for {s.request.guestCount} guests…</p>;
  if (s.request?.status === "OPTIONS_READY") {
    return <CateringOptionsPicker options={s.request.options} busyOptionId={busy} onSelect={(optionId) => post("select", { optionId }, optionId)} />;
  }
  return (
    <div>
      <button disabled={!s.canOrder.ok || !!busy} onClick={() => post("order-food", { clickId: Date.now() }, "order")}>
        {busy ? "Sending guest list…" : "Order Food via Dunback Meadow"}
      </button>
      {!s.canOrder.ok && <p>{s.canOrder.reason}</p>}
      {s.request?.status === "NO_OPTIONS" && <p>No restaurant can cater this event: {s.request.unavailableReasons?.map((r) => r.reason).join("; ")}</p>}
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
    </div>
  );
}
