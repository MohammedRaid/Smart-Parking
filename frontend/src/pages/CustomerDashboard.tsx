import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, CarFront, IndianRupee, MapPinned, QrCode, Search } from "lucide-react";
import { api } from "../lib/api";
import type { Booking } from "../lib/types";
import { inr, prettyDate, prettyTime, tomorrowISO } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { useRealtimeEvents } from "../context/RealtimeContext";
import BookingCard from "../components/BookingCard";
import Spinner from "../components/Spinner";
import Alert from "../components/Alert";

export default function CustomerDashboard() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBookings(await api<Booking[]>("/api/bookings?scope=all"));
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

  useRealtimeEvents(["booking_paid", "booking_cancelled", "booking_verified", "booking_completed"], () => {
    void load();
  });

  const upcoming = bookings.filter((booking) => booking.status === "reserved");
  const active = bookings.filter((booking) => booking.status === "parked");
  const spent = bookings
    .filter((booking) => ["reserved", "parked", "completed"].includes(booking.status))
    .reduce((total, booking) => total + booking.amount, 0);
  const next = upcoming[0] ?? active[0] ?? null;

  const stats = [
    { icon: <CalendarCheck size={18} />, label: "Upcoming reservations", value: String(upcoming.length) },
    { icon: <CarFront size={18} />, label: "Currently parked", value: String(active.length) },
    { icon: <IndianRupee size={18} />, label: "Total spent", value: inr(spent) },
    { icon: <MapPinned size={18} />, label: "Bookings made", value: String(bookings.length) },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Customer dashboard</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Hi {user?.full_name.split(" ")[0]}, ready to park?
          </h1>
          <p className="mt-1 text-sm text-slate-500">Reserve ahead of time and skip the circling.</p>
        </div>
        <Link to="/map" className="btn-primary">
          <Search size={15} /> Find parking
        </Link>
      </div>

      {error && (
        <div className="mt-4">
          <Alert kind="error">{error}</Alert>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-4">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-700">{stat.icon}</span>
            <p className="mt-3 text-2xl font-extrabold text-slate-900">{stat.value}</p>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{stat.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <Spinner label="Loading your bookings…" />
      ) : (
        <div className="mt-6 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900">Next reservation</h2>
              <Link to="/bookings" className="text-xs font-bold text-brand-700">
                All bookings →
              </Link>
            </div>
            {next ? (
              <div className="mt-3">
                <BookingCard booking={next} />
              </div>
            ) : (
              <div className="card mt-3 p-6">
                <p className="text-sm font-semibold text-slate-700">No upcoming parking.</p>
                <p className="mt-1 text-sm text-slate-500">
                  Planning a trip tomorrow? Reserve a slot now and park without waiting.
                </p>
                <Link to={`/map?date=${tomorrowISO()}&start=10:00&end=13:00`} className="btn-primary mt-3 text-xs">
                  Search tomorrow&apos;s parking
                </Link>
              </div>
            )}

            <h2 className="mt-8 text-lg font-extrabold tracking-tight text-slate-900">Recent activity</h2>
            <div className="mt-3 space-y-3">
              {bookings.slice(0, 4).map((booking) => (
                <BookingCard key={booking.id} booking={booking} />
              ))}
              {bookings.length === 0 && (
                <p className="text-sm text-slate-500">Your bookings will appear here once you reserve a space.</p>
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="card overflow-hidden">
              <div className="bg-gradient-to-br from-brand-800 to-brand-600 p-5 text-white">
                <p className="text-xs font-bold uppercase tracking-wide text-brand-100">Quick actions</p>
                <h3 className="mt-1 text-lg font-extrabold">Park smarter today</h3>
                <div className="mt-4 space-y-2">
                  <Link
                    to="/map"
                    className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2.5 text-sm font-semibold ring-1 ring-white/25 hover:bg-white/25"
                  >
                    <Search size={15} /> Find nearby parking
                  </Link>
                  <Link
                    to="/bookings"
                    className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2.5 text-sm font-semibold ring-1 ring-white/25 hover:bg-white/25"
                  >
                    <CalendarCheck size={15} /> Manage reservations
                  </Link>
                </div>
              </div>
              {next && next.status === "reserved" && (
                <div className="p-5 text-center">
                  <QrCode size={20} className="mx-auto text-brand-700" />
                  <p className="mt-1 text-sm font-bold text-slate-900">{next.code}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {prettyDate(next.booking_date)} · {prettyTime(next.start_time)} – {prettyTime(next.end_time)}
                  </p>
                  <Link to={`/booking/${next.code}/qr`} className="btn-secondary mt-3 w-full text-xs">
                    Open QR pass
                  </Link>
                </div>
              )}
            </div>

            <div className="card p-5">
              <h3 className="text-sm font-bold text-slate-900">How entry works</h3>
              <ol className="mt-2 space-y-2 text-xs leading-relaxed text-slate-500">
                <li>1. Arrive within your booked window.</li>
                <li>2. Show your QR pass to the landowner.</li>
                <li>3. Scan on exit to complete the session.</li>
              </ol>
              <Link to="/profile" className="mt-3 block text-xs font-bold text-brand-700">
                Profile &amp; settings →
              </Link>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
