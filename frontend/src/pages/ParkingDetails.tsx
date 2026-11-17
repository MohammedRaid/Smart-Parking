import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Car,
  Clock,
  MapPin,
  ShieldCheck,
  Star,
} from "lucide-react";
import { api } from "../lib/api";
import type { ParkingLocation } from "../lib/types";
import { durationLabel, inr, prettyDate, prettyTime, tomorrowISO } from "../lib/format";
import { estimatePrice } from "../lib/pricing";
import { useRealtimeEvents } from "../context/RealtimeContext";
import AvailabilityBadge from "../components/AvailabilityBadge";
import Alert from "../components/Alert";
import Spinner from "../components/Spinner";
import MapView from "../components/MapView";

export default function ParkingDetails() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [date, setDate] = useState(params.get("date") ?? tomorrowISO());
  const [start, setStart] = useState(params.get("start") ?? "10:00");
  const [end, setEnd] = useState(params.get("end") ?? "13:00");
  const [location, setLocation] = useState<ParkingLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<ParkingLocation>(
        `/api/parking/${id}?booking_date=${date}&start_time=${start}&end_time=${end}`,
      );
      setLocation(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this parking location");
    } finally {
      setLoading(false);
    }
  }, [date, end, id, start]);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeEvents(["availability_changed", "booking_paid", "booking_cancelled", "booking_verified"], () => {
    void load();
  });

  if (loading && !location) {
    return <Spinner label="Loading parking details…" />;
  }

  if (error && !location) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Alert kind="error">{error}</Alert>
        <Link to="/map" className="btn-secondary mt-4">
          <ArrowLeft size={16} /> Back to the map
        </Link>
      </div>
    );
  }

  if (!location) return null;

  const price = estimatePrice(location, start, end);
  const availability = location.availability;
  const reserveHref = `/parking/${location.id}/reserve?date=${date}&start=${start}&end=${end}`;
  const windowValid = start < end;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Link to="/map" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand-700">
        <ArrowLeft size={15} /> Back to map
      </Link>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
            {location.images.length > 0 ? (
              <img
                src={location.images[Math.min(activeImage, location.images.length - 1)]}
                alt={location.name}
                className="h-72 w-full object-cover sm:h-96"
              />
            ) : (
              <div className="grid h-72 place-items-center bg-gradient-to-br from-brand-700 to-brand-900 text-lg font-bold text-white/80 sm:h-96">
                {location.name}
              </div>
            )}
          </div>
          {location.images.length > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto">
              {location.images.map((image, index) => (
                <button
                  key={image}
                  type="button"
                  onClick={() => setActiveImage(index)}
                  className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 ${
                    index === activeImage ? "border-brand-600" : "border-transparent opacity-70"
                  }`}
                >
                  <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}

          <div className="mt-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{location.name}</h1>
                <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-500">
                  <MapPin size={15} className="mt-0.5" /> {location.address}
                </p>
              </div>
              {location.rating.count > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">
                  <Star size={15} className="fill-amber-400 text-amber-400" />
                  {location.rating.average} ({location.rating.count})
                </span>
              )}
            </div>

            <p className="mt-3 text-sm leading-relaxed text-slate-600">{location.description}</p>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { icon: <Car size={16} />, label: "Total slots", value: String(location.total_slots) },
                { icon: <ShieldCheck size={16} />, label: "Free now", value: String(availability?.available_slots ?? 0) },
                { icon: <Clock size={16} />, label: "Open", value: `${prettyTime(location.open_time)} – ${prettyTime(location.close_time)}` },
                { icon: <Building2 size={16} />, label: "Managed by", value: location.owner?.full_name.split(" ")[0] ?? "Owner" },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-slate-200 p-3">
                  <span className="text-slate-400">{item.icon}</span>
                  <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">{item.label}</p>
                  <p className="text-sm font-bold text-slate-800">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <h2 className="text-base font-bold text-slate-900">Slot map for {prettyDate(date)}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {prettyTime(start)} – {prettyTime(end)} · {durationLabel(start, end)}
              </p>
              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
                {(location.slots ?? []).map((slot) => (
                  <div
                    key={slot.id}
                    className={`rounded-lg border px-2 py-2 text-center text-xs font-bold ${
                      !slot.is_active || slot.is_blocked
                        ? "border-slate-200 bg-slate-100 text-slate-400 line-through"
                        : slot.is_free
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-orange-200 bg-orange-50 text-orange-700"
                    }`}
                  >
                    {slot.label}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Green slots are free in this window, orange slots are reserved or occupied.
              </p>
            </div>

            <div className="mt-6">
              <h2 className="text-base font-bold text-slate-900">Reviews</h2>
              {location.reviews && location.reviews.length > 0 ? (
                <div className="mt-3 space-y-3">
                  {location.reviews.map((review) => (
                    <div key={review.id} className="rounded-xl border border-slate-200 p-3.5">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-slate-800">{review.user}</p>
                        <span className="flex items-center gap-0.5 text-xs font-bold text-amber-600">
                          {review.rating}
                          <Star size={12} className="fill-amber-400 text-amber-400" />
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{review.comment}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No reviews yet for this location.</p>
              )}
            </div>

            <div className="mt-6">
              <MapView
                locations={[location]}
                selectedId={location.id}
                center={[location.latitude, location.longitude]}
                zoom={16}
                height="300px"
                query={{ date, start, end }}
              />
            </div>
          </div>
        </div>

        {/* Booking panel */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <AvailabilityBadge availability={availability} />
              {location.distance_km !== null && (
                <span className="text-xs font-semibold text-slate-500">~{location.distance_km} km away</span>
              )}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Hourly</p>
                <p className="text-sm font-extrabold text-slate-900">{inr(location.price_hourly)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Daily</p>
                <p className="text-sm font-extrabold text-slate-900">{inr(location.price_daily)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Monthly</p>
                <p className="text-sm font-extrabold text-slate-900">{inr(location.price_monthly)}</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="label" htmlFor="detail-date">
                  <CalendarDays size={12} className="mr-1 inline" /> Date
                </label>
                <input
                  id="detail-date"
                  type="date"
                  className="input"
                  value={date}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label" htmlFor="detail-start">
                    Arrival
                  </label>
                  <input
                    id="detail-start"
                    type="time"
                    className="input"
                    value={start}
                    onChange={(event) => setStart(event.target.value)}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="detail-end">
                    Departure
                  </label>
                  <input
                    id="detail-end"
                    type="time"
                    className="input"
                    value={end}
                    onChange={(event) => setEnd(event.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/60 p-3.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">
                  {durationLabel(start, end)} at {price.label}
                </span>
                <span className="font-extrabold text-brand-900">{inr(price.amount)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">No hidden fees. Refundable per our cancellation policy.</p>
            </div>

            {!windowValid && (
              <div className="mt-3">
                <Alert kind="error">Departure time must be after arrival time.</Alert>
              </div>
            )}

            {availability && availability.available_slots === 0 ? (
              <button type="button" className="btn-primary mt-4 w-full" disabled>
                No slots available for this window
              </button>
            ) : (
              <Link
                to={reserveHref}
                className={`btn-primary mt-4 w-full ${!windowValid ? "pointer-events-none opacity-60" : ""}`}
              >
                Reserve this slot
              </Link>
            )}
            <p className="mt-2 text-center text-xs text-slate-400">
              {availability?.available_slots ?? 0} of {availability?.total_slots ?? location.total_slots} slots free in this
              window
            </p>

            {location.owner && (
              <div className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
                <p className="font-bold text-slate-700">Hosted by {location.owner.full_name}</p>
                <p className="mt-1">
                  {location.owner.phone ?? location.owner.email}
                  {location.owner.member_since ? ` · member since ${location.owner.member_since}` : ""}
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
