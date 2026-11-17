import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Download, QrCode, Ticket } from "lucide-react";
import { api } from "../lib/api";
import type { Booking } from "../lib/types";
import { durationLabel, inr, prettyDate, prettyTime } from "../lib/format";
import StatusPill from "../components/StatusPill";
import Spinner from "../components/Spinner";
import Alert from "../components/Alert";
import QrPass from "../components/QrPass";

export default function BookingConfirmation() {
  const { code = "" } = useParams();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api<Booking>(`/api/bookings/${code}`)
      .then((data) => {
        if (!cancelled) setBooking(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (loading) return <Spinner label="Loading your confirmation…" />;
  if (!booking) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Alert kind="error">{error ?? "Booking not found"}</Alert>
      </div>
    );
  }

  const paid = booking.payment?.status === "paid";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-brand-800 to-brand-600 px-6 py-8 text-center text-white">
          <CheckCircle2 size={44} className="mx-auto" />
          <h1 className="mt-3 text-2xl font-extrabold">Booking confirmed</h1>
          <p className="mt-1 text-sm text-brand-50/90">
            {paid ? "Payment verified. Show the QR pass at the parking entrance." : "Reservation saved."}
          </p>
          <span className="mt-4 inline-block rounded-xl bg-white/15 px-4 py-2 font-mono text-sm font-bold tracking-wide ring-1 ring-white/30">
            {booking.code}
          </span>
        </div>

        <div className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-slate-900">{booking.location?.name}</p>
              <p className="text-xs text-slate-500">{booking.location?.address}</p>
            </div>
            <StatusPill status={booking.status} />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              { label: "Date", value: prettyDate(booking.booking_date) },
              { label: "Time", value: `${prettyTime(booking.start_time)} – ${prettyTime(booking.end_time)}` },
              { label: "Duration", value: durationLabel(booking.start_time, booking.end_time) },
              { label: "Slot", value: booking.slot?.label ?? "—" },
              { label: "Vehicle", value: booking.vehicle_number ?? "Not provided" },
              { label: "Amount paid", value: inr(booking.amount) },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-slate-200 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{item.label}</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-xl bg-slate-50 p-4">
            <h2 className="text-sm font-bold text-slate-800">Digital receipt</h2>
            <div className="mt-2 grid gap-1.5 text-xs text-slate-600 sm:grid-cols-2">
              <p>
                Receipt no: <span className="font-mono font-semibold">{booking.payment?.receipt_no ?? "—"}</span>
              </p>
              <p>
                Transaction ID: <span className="font-mono font-semibold">{booking.payment?.provider_payment_id ?? "—"}</span>
              </p>
              <p>
                Method: <span className="font-semibold uppercase">{booking.payment?.method ?? "—"}</span>
              </p>
              <p>
                Status: <span className="font-semibold uppercase">{booking.payment?.status ?? "—"}</span>
              </p>
              <p>
                Mode: <span className="font-semibold uppercase">{booking.payment?.mode ?? "—"}</span>
              </p>
              <p>
                Paid at:{" "}
                <span className="font-semibold">
                  {booking.payment?.paid_at ? new Date(booking.payment.paid_at).toLocaleString("en-IN") : "—"}
                </span>
              </p>
            </div>
            {booking.payment?.mode === "mock" && (
              <p className="mt-2 text-[11px] font-semibold text-amber-700">
                Test mode payment — no real money was charged.
              </p>
            )}
          </div>

          <div className="mt-6 flex flex-col items-center gap-3 border-t border-slate-100 pt-6">
            <QrPass value={booking.qr_token} size={180} />
            <p className="max-w-sm text-center text-xs leading-relaxed text-slate-500">
              This QR pass is unique to booking {booking.code}. The landowner scans it once on entry (status becomes Parked)
              and once on exit (status becomes Completed).
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link to={`/booking/${booking.code}/qr`} className="btn-primary">
                <QrCode size={16} /> Open QR pass
              </Link>
              <button type="button" onClick={() => window.print()} className="btn-secondary">
                <Download size={16} /> Print receipt
              </button>
              <Link to={`/booking/${booking.code}`} className="btn-secondary">
                <Ticket size={16} /> Booking details
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-center gap-4 text-sm font-semibold">
        <Link to="/bookings" className="text-brand-700 hover:text-brand-800">
          My bookings
        </Link>
        <Link to="/map" className="text-slate-500 hover:text-brand-700">
          Book another space
        </Link>
      </div>
    </div>
  );
}
