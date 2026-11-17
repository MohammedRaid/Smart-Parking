import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Clock, MapPin, QrCode, Star } from "lucide-react";
import { api } from "../lib/api";
import type { Booking } from "../lib/types";
import { durationLabel, inr, prettyDate, prettyTime, relativeTime } from "../lib/format";
import Alert from "../components/Alert";
import Spinner from "../components/Spinner";
import StatusPill from "../components/StatusPill";
import QrPass from "../components/QrPass";

export default function BookingDetail() {
  const { code = "" } = useParams();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [review, setReview] = useState({ rating: 5, comment: "" });
  const [reviewSent, setReviewSent] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBooking(await api<Booking>(`/api/bookings/${code}`));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the booking");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  const cancel = async () => {
    setCancelling(true);
    setError(null);
    try {
      const result = await api<{ refund_amount: number; policy: string }>(`/api/bookings/${code}/cancel`, {
        method: "POST",
        body: { reason: "Cancelled by customer" },
      });
      setNotice(
        `Booking cancelled. ${result.policy}${result.refund_amount > 0 ? ` Refund: ${inr(result.refund_amount)}.` : ""}`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel this booking");
    } finally {
      setCancelling(false);
    }
  };

  const submitReview = async (event: FormEvent) => {
    event.preventDefault();
    if (!booking?.location) return;
    try {
      await api("/api/reviews", {
        method: "POST",
        body: {
          location_id: booking.location.id,
          booking_id: booking.id,
          rating: review.rating,
          comment: review.comment.trim(),
        },
      });
      setReviewSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your review");
    }
  };

  if (loading) return <Spinner label="Loading booking…" />;
  if (!booking) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Alert kind="error">{error ?? "Booking not found"}</Alert>
      </div>
    );
  }

  const canCancel = booking.status === "reserved" || booking.status === "pending_payment";
  const canReview = booking.status === "completed" || booking.status === "parked";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link to="/bookings" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand-700">
        <ArrowLeft size={15} /> All bookings
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{booking.location?.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
            <MapPin size={14} /> {booking.location?.address}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={booking.status} />
          <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold text-slate-600">
            {booking.code}
          </span>
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

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="text-sm font-bold text-slate-900">Reservation</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="flex items-center gap-1 text-xs font-semibold uppercase text-slate-400">
                  <CalendarDays size={12} /> Date
                </p>
                <p className="mt-0.5 font-bold text-slate-800">{prettyDate(booking.booking_date)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="flex items-center gap-1 text-xs font-semibold uppercase text-slate-400">
                  <Clock size={12} /> Time
                </p>
                <p className="mt-0.5 font-bold text-slate-800">
                  {prettyTime(booking.start_time)} – {prettyTime(booking.end_time)}
                </p>
                <p className="text-xs text-slate-500">{durationLabel(booking.start_time, booking.end_time)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase text-slate-400">Slot</p>
                <p className="mt-0.5 font-bold text-slate-800">{booking.slot?.label}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase text-slate-400">Amount</p>
                <p className="mt-0.5 font-bold text-slate-800">{inr(booking.amount)}</p>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-bold text-slate-900">Payment</h2>
            <div className="mt-2 space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Receipt</span>
                <span className="font-mono font-semibold">{booking.payment?.receipt_no ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span>Transaction ID</span>
                <span className="max-w-[55%] truncate font-mono font-semibold">
                  {booking.payment?.provider_payment_id ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Method</span>
                <span className="font-semibold uppercase">{booking.payment?.method ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Status</span>
                <StatusPill status={booking.payment?.status ?? "created"} />
              </div>
              {booking.refund_amount > 0 && (
                <div className="flex justify-between border-t border-slate-100 pt-1.5 text-violet-700">
                  <span>Refund</span>
                  <span className="font-bold">
                    {inr(booking.refund_amount)} ({booking.refund_status})
                  </span>
                </div>
              )}
            </div>
          </div>

          {booking.verifications && booking.verifications.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-bold text-slate-900">Gate verification log</h2>
              <ul className="mt-2 space-y-2 text-xs text-slate-600">
                {booking.verifications.map((entry, index) => (
                  <li key={`${entry.scanned_at}-${index}`} className="flex items-start gap-2">
                    <span
                      className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                        entry.result === "success" ? "bg-emerald-500" : "bg-rose-500"
                      }`}
                    />
                    <div>
                      <p className="font-semibold text-slate-700">
                        {entry.action.replace("_", " ")} · {relativeTime(entry.scanned_at)}
                      </p>
                      <p>{entry.note}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canReview && (
            <div className="card p-5">
              <h2 className="text-sm font-bold text-slate-900">Rate this parking</h2>
              {reviewSent ? (
                <div className="mt-3">
                  <Alert kind="success">Thanks for sharing your experience.</Alert>
                </div>
              ) : (
                <form onSubmit={submitReview} className="mt-3 space-y-3">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button key={value} type="button" onClick={() => setReview((prev) => ({ ...prev, rating: value }))}>
                        <Star
                          size={22}
                          className={value <= review.rating ? "fill-amber-400 text-amber-400" : "text-slate-300"}
                        />
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="input min-h-20"
                    placeholder="How was the space, access and host?"
                    value={review.comment}
                    onChange={(event) => setReview((prev) => ({ ...prev, comment: event.target.value }))}
                  />
                  <button type="submit" className="btn-primary text-xs">
                    Submit review
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          {booking.status === "reserved" && (
            <div className="card p-5 text-center">
              <p className="text-sm font-bold text-slate-900">Your entry pass</p>
              <div className="mt-3 flex justify-center">
                <QrPass value={booking.qr_token} size={170} />
              </div>
              <Link to={`/booking/${booking.code}/qr`} className="btn-secondary mt-3 w-full text-xs">
                <QrCode size={14} /> Full-screen pass
              </Link>
            </div>
          )}

          {canCancel && booking.cancellation && (
            <div className="card p-5">
              <h2 className="text-sm font-bold text-slate-900">Cancel booking</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{booking.cancellation.policy}</p>
              <p className="mt-2 text-sm font-bold text-violet-700">Refund: {inr(booking.cancellation.refund_amount)}</p>
              <button
                type="button"
                onClick={() => void cancel()}
                className="btn-danger mt-3 w-full text-xs"
                disabled={cancelling}
              >
                {cancelling ? "Cancelling…" : "Cancel reservation"}
              </button>
            </div>
          )}

          <div className="card p-5">
            <h2 className="text-sm font-bold text-slate-900">Timeline</h2>
            <ul className="mt-2 space-y-2 text-xs text-slate-600">
              <li>Booked {booking.created_at ? relativeTime(booking.created_at) : ""}</li>
              {booking.payment?.paid_at && <li>Paid {relativeTime(booking.payment.paid_at)}</li>}
              {booking.checked_in_at && <li>Checked in {relativeTime(booking.checked_in_at)}</li>}
              {booking.checked_out_at && <li>Checked out {relativeTime(booking.checked_out_at)}</li>}
              {booking.cancelled_at && <li>Cancelled {relativeTime(booking.cancelled_at)}</li>}
            </ul>
            <Link to={`/parking/${booking.location?.id}`} className="btn-secondary mt-3 w-full text-xs">
              View location
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
