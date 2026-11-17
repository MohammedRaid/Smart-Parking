import { useCallback, useState } from "react";
import { CheckCircle2, Keyboard, ShieldAlert, XCircle } from "lucide-react";
import { api } from "../lib/api";
import type { Booking } from "../lib/types";
import { inr, prettyDate, prettyTime } from "../lib/format";
import QrScanner from "../components/QrScanner";
import Alert from "../components/Alert";
import StatusPill from "../components/StatusPill";

interface VerifyResult {
  action: string;
  message: string;
  booking: Booking;
}

export default function ScannerPage() {
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [action, setAction] = useState<"auto" | "check_in" | "check_out">("auto");

  const verify = useCallback(
    async (token: string) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const data = await api<VerifyResult>("/api/bookings/verify", {
          method: "POST",
          body: { qr_token: token, action },
        });
        setResult(data);
        setManualCode("");
      } catch (err) {
        setResult(null);
        setError(err instanceof Error ? err.message : "Verification failed");
      } finally {
        setBusy(false);
      }
    },
    [action, busy],
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Scan customer QR pass</h1>
      <p className="mt-1 text-sm text-slate-500">
        First scan checks the vehicle in (status becomes Parked). Scan the same pass again on exit to complete the booking
        and free the slot.
      </p>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 flex flex-wrap gap-2">
            {(["auto", "check_in", "check_out"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setAction(option)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  action === option ? "bg-brand-700 text-white" : "border border-slate-200 text-slate-600"
                }`}
              >
                {option === "auto" ? "Automatic" : option === "check_in" ? "Entry" : "Exit"}
              </button>
            ))}
          </div>

          <QrScanner onScan={(value) => void verify(value)} />

          <div className="mt-4 border-t border-slate-100 pt-4">
            <label className="label" htmlFor="manual-code">
              <Keyboard size={12} className="mr-1 inline" /> Manual booking code
            </label>
            <div className="flex gap-2">
              <input
                id="manual-code"
                className="input font-mono uppercase"
                placeholder="SP2511181234"
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value.toUpperCase())}
              />
              <button
                type="button"
                className="btn-primary text-xs"
                disabled={busy || manualCode.trim().length < 4}
                onClick={() => void verify(manualCode.trim())}
              >
                {busy ? "Verifying…" : "Verify"}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              If the camera is unavailable, type the code printed under the customer&apos;s QR pass.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {error && (
            <Alert kind="error">
              <span className="flex items-center gap-1.5 font-bold">
                <ShieldAlert size={15} /> Verification failed
              </span>
              <span className="mt-1 block">{error}</span>
            </Alert>
          )}

          {result ? (
            <div className="card overflow-hidden">
              <div
                className={`flex items-center gap-2 px-5 py-4 text-white ${
                  result.action === "check_in" ? "bg-blue-600" : "bg-emerald-600"
                }`}
              >
                <CheckCircle2 size={20} />
                <div>
                  <p className="text-sm font-extrabold">
                    {result.action === "check_in" ? "Entry verified" : "Exit verified"}
                  </p>
                  <p className="text-xs text-white/85">{result.message}</p>
                </div>
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-sm font-extrabold text-slate-900">{result.booking.code}</p>
                  <StatusPill status={result.booking.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <p>
                    Customer: <span className="font-bold text-slate-800">{result.booking.customer?.full_name}</span>
                  </p>
                  <p>
                    Vehicle: <span className="font-bold text-slate-800">{result.booking.vehicle_number ?? "—"}</span>
                  </p>
                  <p>
                    Date: <span className="font-bold text-slate-800">{prettyDate(result.booking.booking_date)}</span>
                  </p>
                  <p>
                    Window:{" "}
                    <span className="font-bold text-slate-800">
                      {prettyTime(result.booking.start_time)}–{prettyTime(result.booking.end_time)}
                    </span>
                  </p>
                  <p>
                    Slot: <span className="font-bold text-slate-800">{result.booking.slot?.label}</span>
                  </p>
                  <p>
                    Paid: <span className="font-bold text-slate-800">{inr(result.booking.amount)}</span>
                  </p>
                </div>
                {result.booking.status === "parked" && (
                  <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                    Vehicle is now parked. Scan the pass again when it leaves.
                  </p>
                )}
                {result.booking.status === "completed" && (
                  <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                    Session completed. The slot is available for new bookings.
                  </p>
                )}
              </div>
            </div>
          ) : (
            !error && (
              <div className="card p-6 text-center text-sm text-slate-500">
                <XCircle size={26} className="mx-auto mb-2 text-slate-300" />
                Scan a pass or enter a booking code to see the reservation here.
              </div>
            )
          )}

          <div className="card p-5">
            <h2 className="text-sm font-bold text-slate-900">Security checks</h2>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-500">
              <li>• QR tokens are signed on the server and verified on every scan.</li>
              <li>• Cancelled, expired and already-completed passes are rejected.</li>
              <li>• Passes belonging to another landowner are refused.</li>
              <li>• Entry is allowed from 60 minutes before the booking starts.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
