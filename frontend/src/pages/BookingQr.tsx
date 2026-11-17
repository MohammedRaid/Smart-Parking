import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Info, QrCode, ScanLine } from "lucide-react";
import { api } from "../lib/api";
import type { Booking } from "../lib/types";
import { prettyDate, prettyTime } from "../lib/format";
import QrPass from "../components/QrPass";
import StatusPill from "../components/StatusPill";
import Spinner from "../components/Spinner";
import Alert from "../components/Alert";

export default function BookingQr() {
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

  if (loading) return <Spinner label="Loading your QR pass…" />;
  if (!booking) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Alert kind="error">{error ?? "Booking not found"}</Alert>
      </div>
    );
  }

  const usable = booking.status === "reserved";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link to={`/booking/${booking.code}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand-700">
        <ArrowLeft size={15} /> Back to booking
      </Link>

      <div className="card mt-4 overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <QrCode size={16} className="text-brand-700" /> Parking pass
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{booking.location?.name}</p>
            </div>
            <StatusPill status={booking.status} />
          </div>
        </div>

        <div className="flex flex-col items-center px-6 py-8">
          <QrPass value={booking.qr_token} size={240} />
          <p className="mt-4 font-mono text-lg font-extrabold tracking-wider text-slate-900">{booking.code}</p>
          <p className="mt-1 text-xs text-slate-500">
            Slot {booking.slot?.label} · {prettyDate(booking.booking_date)} · {prettyTime(booking.start_time)} –{" "}
            {prettyTime(booking.end_time)}
          </p>
          {booking.vehicle_number && (
            <p className="mt-1 rounded-lg bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
              {booking.vehicle_number}
            </p>
          )}
        </div>

        <div className="border-t border-slate-100 px-6 py-5">
          {!usable && (
            <div className="mb-3">
              <Alert kind={booking.status === "parked" ? "info" : "error"}>
                {booking.status === "parked"
                  ? "You are checked in. Scan the same pass again when you leave to release the slot."
                  : booking.status === "completed"
                    ? "This parking session is completed. This pass can no longer be used."
                    : `This pass is ${booking.status.replace("_", " ")} and cannot be used at the gate.`}
              </Alert>
            </div>
          )}
          <div className="flex items-start gap-2.5 rounded-xl bg-brand-50 p-3.5 text-xs leading-relaxed text-brand-900">
            <Info size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-bold">How verification works</p>
              <p className="mt-1">
                Show this QR code to the landowner. They scan it with the SmartPark scanner — entry marks the booking as
                <strong> Parked</strong>, exit marks it <strong>Completed</strong> and frees the slot. Expired, cancelled or
                already-used passes are rejected by the server.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => window.print()} className="btn-secondary flex-1 text-xs">
              <ScanLine size={14} /> Print / save pass
            </button>
            <Link to="/bookings" className="btn-primary flex-1 text-xs">
              My bookings
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
