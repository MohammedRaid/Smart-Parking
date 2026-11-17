import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Receipt, Search } from "lucide-react";
import { api } from "../lib/api";
import type { Booking } from "../lib/types";
import { inr } from "../lib/format";
import BookingCard from "../components/BookingCard";
import Spinner from "../components/Spinner";
import Alert from "../components/Alert";
import { useRealtimeEvents } from "../context/RealtimeContext";

type Scope = "upcoming" | "active" | "past" | "all";

const TABS: { id: Scope; label: string }[] = [
  { id: "upcoming", label: "Upcoming" },
  { id: "active", label: "Currently parked" },
  { id: "past", label: "Completed & cancelled" },
  { id: "all", label: "All bookings" },
];

interface PaymentRow {
  id: number;
  receipt_no: string;
  amount: number;
  status: string;
  mode: string;
  method: string | null;
  created_at: string;
  booking_code: string | null;
  location: string | null;
}

export default function BookingHistory() {
  const [scope, setScope] = useState<Scope>("upcoming");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, history] = await Promise.all([
        api<Booking[]>(`/api/bookings?scope=${scope}`),
        api<PaymentRow[]>("/api/payments/history"),
      ]);
      setBookings(list);
      setPayments(history);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load bookings");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeEvents(["booking_paid", "booking_cancelled", "booking_verified", "booking_completed"], () => {
    void load();
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">My bookings</h1>
          <p className="mt-1 text-sm text-slate-500">Track reservations, QR passes, receipts and refunds.</p>
        </div>
        <Link to="/map" className="btn-primary text-xs">
          <Search size={14} /> Find parking
        </Link>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setScope(tab.id)}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              scope === tab.id
                ? "bg-brand-700 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4">
          <Alert kind="error">{error}</Alert>
        </div>
      )}

      {loading ? (
        <Spinner label="Loading your bookings…" />
      ) : bookings.length === 0 ? (
        <div className="card mt-5 p-10 text-center">
          <p className="text-sm font-semibold text-slate-700">No bookings in this view.</p>
          <Link to="/map" className="btn-primary mt-3 text-xs">
            Reserve a parking slot
          </Link>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {bookings.map((booking) => (
            <BookingCard key={booking.id} booking={booking} />
          ))}
        </div>
      )}

      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-slate-900">
          <Receipt size={18} /> Payment history
        </h2>
        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No payments yet.</p>
        ) : (
          <div className="card mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3">Receipt</th>
                  <th className="px-4 py-3">Booking</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-600">{payment.receipt_no}</td>
                    <td className="px-4 py-3 font-mono text-xs">{payment.booking_code ?? "—"}</td>
                    <td className="max-w-40 truncate px-4 py-3 text-xs">{payment.location ?? "—"}</td>
                    <td className="px-4 py-3 text-xs uppercase">{payment.method ?? "—"}</td>
                    <td className="px-4 py-3 font-bold text-slate-800">{inr(payment.amount)}</td>
                    <td className="px-4 py-3 text-xs">
                      <span
                        className={`badge ${
                          payment.status === "paid" || payment.status === "refunded"
                            ? "bg-emerald-50 text-emerald-700"
                            : payment.status === "failed"
                              ? "bg-rose-50 text-rose-700"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {payment.status}
                        {payment.mode === "mock" ? " · test" : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(payment.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
