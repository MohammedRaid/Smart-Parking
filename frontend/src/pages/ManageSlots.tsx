import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Car, ChevronLeft, Plus, Snowflake, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { prettyTime } from "../lib/format";
import Spinner from "../components/Spinner";
import Alert from "../components/Alert";
import StatusPill from "../components/StatusPill";
import { useRealtimeEvents } from "../context/RealtimeContext";

interface SlotRow {
  id: number;
  label: string;
  vehicle_type: string;
  is_active: boolean;
  is_blocked: boolean;
  state: "free" | "reserved" | "occupied" | "unavailable";
  booking: {
    code: string;
    booking_date: string;
    start_time: string;
    end_time: string;
    customer: string | null;
  } | null;
}

interface SlotsResponse {
  location: { id: number; name: string; total_slots: number };
  slots: SlotRow[];
  summary: { available_slots: number; reserved_slots: number; occupied_slots: number; total_slots: number };
}

const STATE_STYLES: Record<SlotRow["state"], string> = {
  free: "border-emerald-200 bg-emerald-50 text-emerald-800",
  reserved: "border-orange-200 bg-orange-50 text-orange-800",
  occupied: "border-rose-200 bg-rose-50 text-rose-800",
  unavailable: "border-slate-200 bg-slate-100 text-slate-400",
};

export default function ManageSlots() {
  const { id = "" } = useParams();
  const [data, setData] = useState<SlotsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<SlotsResponse>(`/api/landowner/locations/${id}/slots`));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load slots");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeEvents(["booking_paid", "booking_cancelled", "booking_verified", "booking_completed"], () => {
    void load();
  });

  const patch = async (slotId: number, body: Record<string, unknown>) => {
    try {
      await api(`/api/slots/${slotId}`, { method: "PATCH", body });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the slot");
    }
  };

  const addSlot = async () => {
    if (!newLabel.trim()) return;
    try {
      await api(`/api/landowner/locations/${id}/slots`, {
        method: "POST",
        body: { label: newLabel.trim(), vehicle_type: "car", is_active: true },
      });
      setNewLabel("");
      setNotice("Slot added.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add a slot");
    }
  };

  const removeSlot = async (slot: SlotRow) => {
    if (!window.confirm(`Remove slot ${slot.label}?`)) return;
    try {
      await api(`/api/slots/${slot.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the slot");
    }
  };

  if (loading) return <Spinner label="Loading slots…" />;
  if (!data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Alert kind="error">{error ?? "Location not found"}</Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link to="/landowner" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand-700">
        <ChevronLeft size={15} /> Dashboard
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{data.location.name}</h1>
          <p className="mt-1 text-sm text-slate-500">Manage slots and see live occupancy.</p>
        </div>
        <div className="flex gap-2 text-xs font-semibold">
          <span className="badge bg-emerald-50 text-emerald-700">{data.summary.available_slots} free</span>
          <span className="badge bg-orange-50 text-orange-700">{data.summary.reserved_slots} reserved</span>
          <span className="badge bg-rose-50 text-rose-700">{data.summary.occupied_slots} occupied</span>
        </div>
      </div>

      {notice && (
        <div className="mt-4">
          <Alert kind="success">{notice}</Alert>
        </div>
      )}
      {error && (
        <div className="mt-4">
          <Alert kind="error">{error}</Alert>
        </div>
      )}

      <div className="card mt-5 p-5">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1">
            <label className="label" htmlFor="new-slot">
              Add a slot
            </label>
            <input
              id="new-slot"
              className="input"
              placeholder="e.g. B7"
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value.toUpperCase())}
            />
          </div>
          <button type="button" onClick={() => void addSlot()} className="btn-primary text-xs">
            <Plus size={14} /> Add slot
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.slots.map((slot) => (
            <div key={slot.id} className={`rounded-xl border p-3 ${STATE_STYLES[slot.state]}`}>
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm font-extrabold">
                  <Car size={14} /> {slot.label}
                </p>
                <StatusPill
                  status={
                    slot.state === "free"
                      ? "approved"
                      : slot.state === "reserved"
                        ? "reserved"
                        : slot.state === "occupied"
                          ? "parked"
                          : "cancelled"
                  }
                />
              </div>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide opacity-80">{slot.state}</p>
              {slot.booking && (
                <div className="mt-2 rounded-lg bg-white/70 px-2 py-1.5 text-[11px] font-medium">
                  <p className="font-mono font-bold">{slot.booking.code}</p>
                  <p>{slot.booking.customer ?? "Customer"}</p>
                  <p>
                    {slot.booking.booking_date} · {prettyTime(slot.booking.start_time)}–{prettyTime(slot.booking.end_time)}
                  </p>
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => void patch(slot.id, { is_blocked: !slot.is_blocked })}
                  className="rounded-lg bg-white/80 px-2 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200"
                >
                  <Snowflake size={11} className="mr-1 inline" />
                  {slot.is_blocked ? "Unblock" : "Block"}
                </button>
                <button
                  type="button"
                  onClick={() => void patch(slot.id, { is_active: !slot.is_active })}
                  className="rounded-lg bg-white/80 px-2 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200"
                >
                  {slot.is_active ? "Disable" : "Enable"}
                </button>
                {slot.state === "free" && (
                  <button
                    type="button"
                    onClick={() => void removeSlot(slot)}
                    className="rounded-lg bg-white/80 px-2 py-1 text-[11px] font-bold text-rose-600 ring-1 ring-rose-200"
                  >
                    <Trash2 size={11} className="mr-1 inline" /> Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card mt-4 p-5">
        <h2 className="text-sm font-bold text-slate-900">Status legend</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          <strong>Free</strong> — bookable for upcoming windows. <strong>Reserved</strong> — a paid advance booking holds this
          slot. <strong>Occupied</strong> — the customer has scanned in and the vehicle is parked. Blocked or disabled slots
          are excluded from availability.
        </p>
      </div>
    </div>
  );
}
