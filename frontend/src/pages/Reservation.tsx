import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Clock, Loader2, Lock, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import type { Checkout, ParkingLocation } from "../lib/types";
import { durationLabel, inr, prettyDate, prettyTime, tomorrowISO } from "../lib/format";
import { estimatePrice } from "../lib/pricing";
import AvailabilityBadge from "../components/AvailabilityBadge";
import Alert from "../components/Alert";
import Spinner from "../components/Spinner";

interface BookingResponse {
  booking: { code: string };
  checkout: Checkout;
}

export default function Reservation() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [location, setLocation] = useState<ParkingLocation | null>(null);
  const [date, setDate] = useState(params.get("date") ?? tomorrowISO());
  const [start, setStart] = useState(params.get("start") ?? "10:00");
  const [end, setEnd] = useState(params.get("end") ?? "13:00");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLocation(
        await api<ParkingLocation>(`/api/parking/${id}?booking_date=${date}&start_time=${start}&end_time=${end}`),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this parking location");
    } finally {
      setLoading(false);
    }
  }, [date, end, id, start]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !location) return <Spinner label="Checking availability…" />;
  if (!location) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Alert kind="error">{error ?? "Parking location not found"}</Alert>
      </div>
    );
  }

  const availability = location.availability;
  const price = estimatePrice(location, start, end);
  const invalidWindow = start >= end;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (invalidWindow) {
      setError("Departure time must be after arrival time");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api<BookingResponse>("/api/bookings", {
        method: "POST",
        body: {
          location_id: location.id,
          booking_date: date,
          start_time: start,
          end_time: end,
          vehicle_number: vehicleNumber.trim() || null,
        },
      });
      navigate(`/payment/${result.booking.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the booking");
      void load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link
        to={`/parking/${location.id}?date=${date}&start=${start}&end=${end}`}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand-700"
      >
        <ArrowLeft size={15} /> Back to location
      </Link>

      <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Reserve your parking</h1>
      <p className="mt-1 text-sm text-slate-500">
        Choose your window, confirm the slot and pay securely. The slot is held for 15 minutes.
      </p>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <form onSubmit={submit} className="card p-5 sm:p-6">
          {error && (
            <div className="mb-4">
              <Alert kind="error">{error}</Alert>
            </div>
          )}

          <div className="flex items-center gap-3">
            {location.images[0] && (
              <img src={location.images[0]} alt={location.name} className="h-16 w-20 rounded-xl object-cover" />
            )}
            <div>
              <h2 className="text-base font-bold text-slate-900">{location.name}</h2>
              <p className="text-xs text-slate-500">
                {location.area}, {location.city}
              </p>
              <div className="mt-1">
                <AvailabilityBadge availability={availability} compact />
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="res-date">
                <CalendarDays size={12} className="mr-1 inline" /> Booking date
              </label>
              <input
                id="res-date"
                type="date"
                required
                className="input"
                value={date}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="res-start">
                Arrival time
              </label>
              <input
                id="res-start"
                type="time"
                required
                className="input"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="res-end">
                Departure time
              </label>
              <input
                id="res-end"
                type="time"
                required
                className="input"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="label" htmlFor="res-vehicle">
              Vehicle number (optional)
            </label>
            <input
              id="res-vehicle"
              className="input uppercase"
              placeholder="KA05MJ4321"
              value={vehicleNumber}
              onChange={(event) => setVehicleNumber(event.target.value.toUpperCase())}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              The landowner checks this when you scan your QR pass. Operating hours:{" "}
              {prettyTime(location.open_time)} – {prettyTime(location.close_time)}.
            </p>
          </div>

          <div className="mt-5 rounded-xl bg-slate-50 p-4">
            <h3 className="text-sm font-bold text-slate-800">Price summary</h3>
            <div className="mt-2 space-y-1.5 text-sm text-slate-600">
              <div className="flex justify-between">
                <span>
                  {durationLabel(start, end)} · {prettyDate(date)}
                </span>
                <span>
                  {prettyTime(start)} – {prettyTime(end)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>
                  {inr(location.price_hourly)}/hour ({price.label})
                </span>
                <span className="font-bold text-slate-900">{inr(price.amount)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5">
                <span className="font-bold text-slate-800">Total payable</span>
                <span className="font-extrabold text-brand-800">{inr(price.amount)}</span>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary mt-5 w-full"
            disabled={busy || invalidWindow || (availability?.available_slots ?? 0) === 0}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
            {busy ? "Holding your slot…" : "Continue to payment"}
          </button>
          <p className="mt-2 flex items-center justify-center gap-1 text-center text-xs text-slate-400">
            <ShieldCheck size={13} /> Free cancellation up to 2 hours before arrival
          </p>
        </form>

        <aside className="space-y-4">
          <div className="card p-5">
            <h3 className="text-sm font-bold text-slate-900">Availability for your window</h3>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <div className="flex justify-between">
                <span>Total slots</span>
                <span className="font-bold">{availability?.total_slots ?? location.total_slots}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>Free</span>
                <span className="font-bold">{availability?.available_slots ?? 0}</span>
              </div>
              <div className="flex justify-between text-orange-700">
                <span>Reserved in this window</span>
                <span className="font-bold">{availability?.reserved_slots ?? 0}</span>
              </div>
              <div className="flex justify-between text-rose-700">
                <span>Occupied right now</span>
                <span className="font-bold">{availability?.occupied_slots ?? 0}</span>
              </div>
            </div>
            <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
              A slot is assigned automatically from the free slots for your window. Overlapping reservations are rejected
              so two drivers never get the same space.
            </p>
          </div>

          {invalidWindow && <Alert kind="error">Departure must be after arrival.</Alert>}
          {!invalidWindow && (availability?.available_slots ?? 0) === 0 && (
            <Alert kind="error">This lot is full for the selected window. Try another time or location.</Alert>
          )}

          <div className="card p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Clock size={15} /> Cancellation policy
            </h3>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-500">
              <li>• Full refund when you cancel 2+ hours before arrival.</li>
              <li>• 50% refund within 2 hours of arrival.</li>
              <li>• No refund after the parking session starts.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
