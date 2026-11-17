import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CarFront, CheckCircle2, ParkingCircle, ShieldCheck } from "lucide-react";

const points = [
  { icon: <CarFront size={16} />, text: "Live availability for your exact date and time window" },
  { icon: <ShieldCheck size={16} />, text: "Verified listings, secure sign-in and QR gate passes" },
  { icon: <CheckCircle2 size={16} />, text: "Cancel with a clear, upfront refund policy" },
];

export default function AuthShell({
  title,
  subtitle,
  accented = "Smart",
  children,
  footer,
  variant = "customer",
}: {
  title: string;
  subtitle: string;
  accented?: string;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "customer" | "landowner" | "admin";
}) {
  const tagline =
    variant === "landowner"
      ? "Turn unused land into a predictable monthly income."
      : variant === "admin"
        ? "Platform oversight, moderation and revenue in one console."
        : "The fastest way to find and reserve parking near you.";

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_460px] lg:py-16">
      <div className="hidden lg:block">
        <Link to="/" className="inline-flex items-center gap-2 text-brand-800">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-700 text-white">
            <ParkingCircle size={22} />
          </span>
          <span className="text-xl font-extrabold">
            Smart<span className="text-brand-600">Park</span>
          </span>
        </Link>
        <h1 className="mt-8 text-4xl font-extrabold leading-tight tracking-tight text-slate-900">{tagline}</h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-slate-500">
          SmartPark connects drivers searching for parking with landowners who have unused space. Reserve by the hour,
          arrive with a QR pass, and pay securely online.
        </p>
        <ul className="mt-8 space-y-3">
          {points.map((point) => (
            <li key={point.text} className="flex items-start gap-3 text-sm font-medium text-slate-600">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                {point.icon}
              </span>
              {point.text}
            </li>
          ))}
        </ul>
      </div>

      <div className="card animate-rise p-6 sm:p-8">
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
          {title} <span className="text-brand-700">{accented}</span>
        </h2>
        <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-5 border-t border-slate-100 pt-4 text-sm text-slate-500">{footer}</div>}
      </div>
    </div>
  );
}
