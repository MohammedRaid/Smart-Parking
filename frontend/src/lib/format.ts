export function inr(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function todayISO(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function tomorrowISO(): string {
  const now = new Date(Date.now() + 86400000);
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function prettyDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function shortDate(iso: string): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function prettyTime(time: string): string {
  if (!time) return "";
  const [hourRaw, minute] = time.split(":");
  const hour = Number(hourRaw);
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${minute} ${suffix}`;
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function durationLabel(start: string, end: string): string {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const total = eh * 60 + em - (sh * 60 + sm);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

export const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending_payment: { label: "Awaiting payment", className: "bg-amber-50 text-amber-700" },
  reserved: { label: "Reserved", className: "bg-orange-50 text-orange-700" },
  parked: { label: "Parked", className: "bg-blue-50 text-blue-700" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-600" },
  expired: { label: "Expired", className: "bg-rose-50 text-rose-700" },
  paid: { label: "Paid", className: "bg-emerald-50 text-emerald-700" },
  failed: { label: "Failed", className: "bg-rose-50 text-rose-700" },
  created: { label: "Created", className: "bg-slate-100 text-slate-600" },
  refunded: { label: "Refunded", className: "bg-violet-50 text-violet-700" },
  approved: { label: "Approved", className: "bg-emerald-50 text-emerald-700" },
  pending: { label: "Pending", className: "bg-amber-50 text-amber-700" },
  rejected: { label: "Rejected", className: "bg-rose-50 text-rose-700" },
  open: { label: "Open", className: "bg-amber-50 text-amber-700" },
  resolved: { label: "Resolved", className: "bg-emerald-50 text-emerald-700" },
};

export const AVAILABILITY_META = {
  green: { label: "Available", dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" },
  orange: { label: "Partly reserved", dot: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50" },
  red: { label: "Full", dot: "bg-rose-500", text: "text-rose-700", bg: "bg-rose-50" },
} as const;
