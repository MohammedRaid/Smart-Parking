import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  CalendarClock,
  CarFront,
  IndianRupee,
  Layers,
  Plus,
  ScanLine,
  Trash2,
} from "lucide-react";
import { api } from "../lib/api";
import type { Booking, Earnings, ParkingLocation } from "../lib/types";
import { inr } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { useRealtimeEvents } from "../context/RealtimeContext";
import BookingCard from "../components/BookingCard";
import StatusPill from "../components/StatusPill";
import Spinner from "../components/Spinner";
import Alert from "../components/Alert";

export default function LandownerDashboard() {
  const { user } = useAuth();
  const [locations, setLocations] = useState<ParkingLocation[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, reservations, money] = await Promise.all([
        api<ParkingLocation[]>("/api/landowner/locations"),
        api<Booking[]>("/api/landowner/bookings?scope=all"),
        api<Earnings>("/api/landowner/earnings"),
      ]);
      setLocations(list);
      setBookings(reservations);
      setEarnings(money);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeEvents(["booking_paid", "booking_cancelled", "booking_verified", "booking_completed", "listing_updated"], () => {
    void load();
  });

  const remove = async (location: ParkingLocation) => {
    if (!window.confirm(`Remove "${location.name}" from SmartPark? This cannot be undone.`)) return;
    try {
      await api(`/api/landowner/locations/${location.id}`, { method: "DELETE" });
      setNotice(`${location.name} removed.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove this listing");
    }
  };

  const upcoming = bookings.filter((booking) => booking.status === "reserved");
  const parked = bookings.filter((booking) => booking.status === "parked");
  const totalSlots = locations.reduce((sum, location) => sum + location.total_slots, 0);
  const pending = locations.filter((location) => location.status === "pending");

  const stats = [
    { icon: <Building2 size={18} />, label: "Listings", value: String(locations.length) },
    { icon: <Layers size={18} />, label: "Total slots", value: String(totalSlots) },
    { icon: <CalendarClock size={18} />, label: "Upcoming reservations", value: String(upcoming.length) },
    { icon: <CarFront size={18} />, label: "Vehicles parked", value: String(parked.length) },
    { icon: <IndianRupee size={18} />, label: "Net earnings", value: inr(earnings?.net_earnings ?? 0) },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Landowner dashboard</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            {user?.full_name.split(" ")[0]}&apos;s parking business
          </h1>
          <p className="mt-1 text-sm text-slate-500">Manage listings, verify arrivals and track payouts.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/landowner/scanner" className="btn-secondary text-xs">
            <ScanLine size={14} /> Scan QR
          </Link>
          <Link to="/landowner/listings/new" className="btn-primary text-xs">
            <Plus size={14} /> Add parking
          </Link>
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
      {pending.length > 0 && (
        <div className="mt-4">
          <Alert kind="info">
            {pending.length} listing{pending.length === 1 ? " is" : "s are"} awaiting admin approval and not yet visible to
            customers.
          </Alert>
        </div>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-4">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-700">{stat.icon}</span>
            <p className="mt-3 text-xl font-extrabold text-slate-900">{stat.value}</p>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{stat.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <Spinner label="Loading your listings…" />
      ) : (
        <div className="mt-6 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900">Your listings</h2>
              <Link to="/landowner/earnings" className="text-xs font-bold text-brand-700">
                Earnings →
              </Link>
            </div>

            <div className="mt-3 space-y-3">
              {locations.length === 0 && (
                <div className="card p-6 text-center">
                  <p className="text-sm font-semibold text-slate-700">No parking locations yet.</p>
                  <p className="mt-1 text-sm text-slate-500">Add your first space and start earning.</p>
                  <Link to="/landowner/listings/new" className="btn-primary mt-3 text-xs">
                    <Plus size={14} /> Add parking
                  </Link>
                </div>
              )}

              {locations.map((location) => (
                <article key={location.id} className="card p-4">
                  <div className="flex gap-3">
                    {location.images[0] ? (
                      <img src={location.images[0]} alt="" className="h-20 w-24 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <div className="grid h-20 w-24 shrink-0 place-items-center rounded-xl bg-brand-800 text-xs font-bold text-white/70">
                        No photo
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-bold text-slate-900">{location.name}</h3>
                        <StatusPill status={location.status} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {location.area}, {location.city}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {location.total_slots} slots · {location.availability?.available_slots ?? 0} free now ·{" "}
                        {inr(location.price_hourly)}/hr
                      </p>
                      {location.rejection_reason && (
                        <p className="mt-1 text-xs font-medium text-rose-600">
                          Rejected: {location.rejection_reason}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    <Link to={`/landowner/listings/${location.id}/slots`} className="btn-secondary px-3 py-1.5 text-xs">
                      <Layers size={13} /> Manage slots
                    </Link>
                    <Link to={`/parking/${location.id}`} className="btn-secondary px-3 py-1.5 text-xs">
                      View listing
                    </Link>
                    <button
                      type="button"
                      onClick={() => void remove(location)}
                      className="btn-secondary ml-auto px-3 py-1.5 text-xs text-rose-600 hover:border-rose-200 hover:bg-rose-50"
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900">Latest reservations</h2>
              <Link to="/landowner/scanner" className="text-xs font-bold text-brand-700">
                Scan →
              </Link>
            </div>
            <div className="mt-3 space-y-3">
              {bookings.slice(0, 5).map((booking) => (
                <BookingCard key={booking.id} booking={booking} showCustomer />
              ))}
              {bookings.length === 0 && (
                <p className="text-sm text-slate-500">Reservations will appear here once customers book.</p>
              )}
            </div>

            <div className="card mt-4 p-5">
              <h3 className="text-sm font-bold text-slate-900">Payout summary</h3>
              <div className="mt-2 space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Gross bookings</span>
                  <span className="font-bold">{inr(earnings?.gross_earnings ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Platform fee</span>
                  <span className="font-bold text-rose-600">−{inr(earnings?.platform_fee ?? 0)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-1.5 text-sm">
                  <span className="font-bold">Net earnings</span>
                  <span className="font-extrabold text-brand-800">{inr(earnings?.net_earnings ?? 0)}</span>
                </div>
              </div>
              <Link to="/landowner/earnings" className="btn-secondary mt-3 w-full text-xs">
                View earnings dashboard
              </Link>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
