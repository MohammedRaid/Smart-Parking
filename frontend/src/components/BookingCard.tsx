import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Clock, MapPin, QrCode } from "lucide-react";
import type { Booking } from "../lib/types";
import { inr, prettyDate, prettyTime, durationLabel } from "../lib/format";
import StatusPill from "./StatusPill";

export default function BookingCard({
  booking,
  actions,
  showCustomer = false,
}: {
  booking: Booking;
  actions?: ReactNode;
  showCustomer?: boolean;
}) {
  return (
    <article className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">{booking.location?.name}</h3>
            <StatusPill status={booking.status} />
          </div>
          <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
            <MapPin size={12} /> {booking.location?.area}, {booking.location?.city}
          </p>
          {showCustomer && booking.customer && (
            <p className="mt-1 text-xs font-medium text-slate-600">
              {booking.customer.full_name} · {booking.customer.phone ?? booking.customer.email}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-base font-extrabold text-slate-900">{inr(booking.amount)}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Slot {booking.slot?.label ?? "—"}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600 sm:grid-cols-3">
        <span className="flex items-center gap-1.5">
          <CalendarDays size={13} className="text-slate-400" /> {prettyDate(booking.booking_date)}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock size={13} className="text-slate-400" /> {prettyTime(booking.start_time)} – {prettyTime(booking.end_time)}
        </span>
        <span className="font-semibold text-slate-500">{durationLabel(booking.start_time, booking.end_time)}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-[11px] font-bold text-slate-600">
          {booking.code}
        </span>
        {booking.vehicle_number && (
          <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
            {booking.vehicle_number}
          </span>
        )}
        {booking.refund_amount > 0 && (
          <span className="rounded-lg bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700">
            Refund {inr(booking.refund_amount)}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {booking.status === "reserved" && (
            <Link to={`/booking/${booking.code}/qr`} className="btn-secondary px-3 py-1.5 text-xs">
              <QrCode size={14} /> QR pass
            </Link>
          )}
          {booking.status === "pending_payment" && (
            <Link to={`/payment/${booking.code}`} className="btn-primary px-3 py-1.5 text-xs">
              Complete payment
            </Link>
          )}
          <Link to={`/booking/${booking.code}`} className="btn-secondary px-3 py-1.5 text-xs">
            Details
          </Link>
          {actions}
        </div>
      </div>
    </article>
  );
}
