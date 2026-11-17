import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, CreditCard, Loader2, Lock, ShieldCheck, Smartphone } from "lucide-react";
import { api } from "../lib/api";
import type { Booking } from "../lib/types";
import { durationLabel, inr, prettyDate, prettyTime } from "../lib/format";
import Alert from "../components/Alert";
import Spinner from "../components/Spinner";

type Method = "upi" | "gpay" | "phonepe" | "card" | "netbanking";

const METHODS: { id: Method; label: string; hint: string }[] = [
  { id: "upi", label: "UPI", hint: "Any UPI app or ID" },
  { id: "gpay", label: "Google Pay", hint: "Via UPI" },
  { id: "phonepe", label: "PhonePe", hint: "Via UPI" },
  { id: "card", label: "Debit / Credit card", hint: "Visa, Mastercard, RuPay" },
  { id: "netbanking", label: "Netbanking", hint: "All major banks" },
];

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (payload: unknown) => void) => void;
}

export default function Payment() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Method | null>(null);
  const [method, setMethod] = useState<Method>("upi");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Booking>(`/api/bookings/${code}`);
      setBooking(data);
      if (data.status === "reserved" || data.status === "parked" || data.status === "completed") {
        navigate(`/booking/${code}/confirmed`, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this booking");
    } finally {
      setLoading(false);
    }
  }, [code, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const payLive = async () => {
    if (!booking?.payment) return;
    const win = window as unknown as {
      Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
    };
    if (!win.Razorpay) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Could not load the Razorpay checkout"));
        document.body.appendChild(script);
      }).catch((err: Error) => {
        setError(err.message);
        setBusy(null);
      });
    }
    if (!win.Razorpay) return;

    const instance = new win.Razorpay({
      key: booking.payment.key_id ?? undefined,
      order_id: booking.payment.provider_order_id,
      amount: Math.round(booking.amount * 100),
      currency: booking.payment.currency || "INR",
      name: "SmartPark",
      description: `Parking · ${booking.location?.name ?? ""}`,
      prefill: { name: booking.customer?.full_name, email: booking.customer?.email, contact: booking.customer?.phone },
      theme: { color: "#0f766e" },
      handler: async (response: Record<string, string>) => {
        try {
          await api("/api/payments/verify", {
            method: "POST",
            body: {
              booking_code: booking.code,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            },
          });
          navigate(`/booking/${booking.code}/confirmed`);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Payment verification failed");
        }
      },
      modal: { ondismiss: () => setBusy(null) },
    });
    instance.open();
  };

  const payMock = async (outcome: "success" | "failed" | "cancelled") => {
    setBusy(method);
    setError(null);
    try {
      await api(`/api/payments/${code}/mock-pay`, {
        method: "POST",
        body: { method, outcome },
      });
      navigate(`/booking/${code}/confirmed`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
      void load();
    } finally {
      setBusy(null);
    }
  };

  const startPayment = async () => {
    if (!booking) return;
    setError(null);
    if (booking.payment?.mode === "live") {
      setBusy(method);
      await payLive();
      return;
    }
    await payMock("success");
  };

  if (loading) return <Spinner label="Loading payment…" />;
  if (!booking) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Alert kind="error">{error ?? "Booking not found"}</Alert>
      </div>
    );
  }

  const isLive = booking.payment?.mode === "live";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Secure checkout</h1>
      <p className="mt-1 text-sm text-slate-500">
        Slot {booking.slot?.label} is held for 15 minutes. Complete payment to confirm.
      </p>

      {!isLive && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <AlertTriangle size={16} /> TEST PAYMENT MODE — no real money moves
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">
            Razorpay API keys are not configured on this deployment, so the gateway is simulated. Add
            <code className="mx-1 rounded bg-amber-100 px-1 py-0.5 font-mono">RAZORPAY_KEY_ID</code> and
            <code className="mx-1 rounded bg-amber-100 px-1 py-0.5 font-mono">RAZORPAY_KEY_SECRET</code> to
            <code className="mx-1 rounded bg-amber-100 px-1 py-0.5 font-mono">backend/.env</code> to enable live UPI/card
            payments.
          </p>
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="card p-5 sm:p-6">
          <h2 className="text-base font-bold text-slate-900">Choose a payment method</h2>
          <div className="mt-3 space-y-2">
            {METHODS.map((item) => (
              <label
                key={item.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition ${
                  method === item.id ? "border-brand-600 bg-brand-50/50 ring-1 ring-brand-600" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="method"
                  className="h-4 w-4 accent-brand-700"
                  checked={method === item.id}
                  onChange={() => setMethod(item.id)}
                />
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-brand-700 ring-1 ring-slate-200">
                  {item.id === "card" ? <CreditCard size={16} /> : <Smartphone size={16} />}
                </span>
                <span>
                  <span className="block text-sm font-bold text-slate-800">{item.label}</span>
                  <span className="block text-xs text-slate-500">{item.hint}</span>
                </span>
              </label>
            ))}
          </div>

          {error && (
            <div className="mt-4">
              <Alert kind="error">{error}</Alert>
            </div>
          )}

          <button type="button" onClick={() => void startPayment()} className="btn-primary mt-5 w-full" disabled={busy !== null}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
            {busy ? "Processing…" : `Pay ${inr(booking.amount)}`}
          </button>

          {!isLive && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void payMock("failed")}
                className="btn-secondary flex-1 text-xs"
                disabled={busy !== null}
              >
                Simulate failed payment
              </button>
              <button
                type="button"
                onClick={() => void payMock("cancelled")}
                className="btn-secondary flex-1 text-xs"
                disabled={busy !== null}
              >
                Simulate cancelled payment
              </button>
            </div>
          )}

          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            Card details are entered on the Razorpay gateway only. SmartPark stores just the transaction reference, method
            and amount. Payments are verified on the server before a booking is confirmed.
          </p>
        </div>

        <aside className="card h-fit p-5">
          <h2 className="text-base font-bold text-slate-900">Order summary</h2>
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            <p className="font-bold text-slate-800">{booking.location?.name}</p>
            <p className="text-xs">
              {booking.location?.address}
            </p>
            <div className="flex justify-between border-t border-slate-100 pt-2">
              <span>Date</span>
              <span className="font-semibold">{prettyDate(booking.booking_date)}</span>
            </div>
            <div className="flex justify-between">
              <span>Time</span>
              <span className="font-semibold">
                {prettyTime(booking.start_time)} – {prettyTime(booking.end_time)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Duration</span>
              <span className="font-semibold">{durationLabel(booking.start_time, booking.end_time)}</span>
            </div>
            <div className="flex justify-between">
              <span>Slot</span>
              <span className="font-semibold">{booking.slot?.label}</span>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-2 text-base">
              <span className="font-bold text-slate-800">Total</span>
              <span className="font-extrabold text-brand-800">{inr(booking.amount)}</span>
            </div>
          </div>
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 font-mono text-[11px] font-bold text-slate-500">
            {booking.code}
          </p>
          <Link to="/map" className="mt-3 block text-center text-xs font-semibold text-slate-500 hover:text-brand-700">
            Cancel and go back to the map
          </Link>
        </aside>
      </div>
    </div>
  );
}
