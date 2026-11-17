import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, IndianRupee, Receipt, Wallet } from "lucide-react";
import { api } from "../lib/api";
import type { Earnings as EarningsData } from "../lib/types";
import { inr, relativeTime } from "../lib/format";
import Spinner from "../components/Spinner";
import Alert from "../components/Alert";

export default function Earnings() {
  const [data, setData] = useState<EarningsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api<EarningsData>("/api/landowner/earnings")
      .then((result) => {
        if (!cancelled) setData(result);
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
  }, []);

  if (loading) return <Spinner label="Loading earnings…" />;
  if (!data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Alert kind="error">{error ?? "Could not load earnings"}</Alert>
      </div>
    );
  }

  const cards = [
    { icon: <Wallet size={18} />, label: "Net earnings", value: inr(data.net_earnings), note: "after 10% platform fee" },
    { icon: <IndianRupee size={18} />, label: "Gross bookings", value: inr(data.gross_earnings), note: `${data.paid_bookings} paid bookings` },
    { icon: <ArrowDownRight size={18} />, label: "Platform fee", value: inr(data.platform_fee), note: "deducted automatically" },
    { icon: <ArrowUpRight size={18} />, label: "Refunds issued", value: inr(data.refunds), note: "per cancellation policy" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Finance</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Earnings &amp; payments
          </h1>
          <p className="mt-1 text-sm text-slate-500">Every paid reservation, platform fee and refund in one view.</p>
        </div>
        <Link to="/landowner" className="btn-secondary text-xs">
          Back to dashboard
        </Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="card p-4">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-700">{card.icon}</span>
            <p className="mt-3 text-xl font-extrabold text-slate-900">{card.value}</p>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{card.label}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">{card.note}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="card p-5">
          <h2 className="text-sm font-bold text-slate-900">Monthly earnings</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={48} />
                <Tooltip
                  formatter={(value) => [inr(Number(value ?? 0)), "Earnings"]}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                />
                <Bar dataKey="earnings" fill="#0d9488" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-bold text-slate-900">Session overview</h2>
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            <div className="flex justify-between">
              <span>Paid bookings</span>
              <span className="font-bold">{data.paid_bookings}</span>
            </div>
            <div className="flex justify-between">
              <span>Active reservations</span>
              <span className="font-bold">{data.active_bookings}</span>
            </div>
            <div className="flex justify-between">
              <span>Completed sessions</span>
              <span className="font-bold">{data.completed_bookings}</span>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-2">
              <span>Refunds processed</span>
              <span className="font-bold text-violet-700">{inr(data.refunds)}</span>
            </div>
          </div>

          <h3 className="mt-5 text-sm font-bold text-slate-900">Per location</h3>
          <div className="mt-2 space-y-2">
            {data.locations.length === 0 && <p className="text-xs text-slate-500">No listings yet.</p>}
            {data.locations.map((location) => (
              <div key={location.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="truncate text-xs font-bold text-slate-800">{location.name}</p>
                  <p className="text-xs font-extrabold text-brand-800">{inr(location.net)}</p>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {location.city} · {location.bookings} bookings · {inr(location.hourly)}/hr
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="mt-6">
        <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-slate-900">
          <Receipt size={18} /> Transaction ledger
        </h2>
        {data.transactions.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No transactions yet.</p>
        ) : (
          <div className="card mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Note</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">When</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 text-xs font-bold uppercase text-slate-600">{row.kind.replace("_", " ")}</td>
                    <td className="max-w-40 truncate px-4 py-3 font-mono text-xs">{row.reference || "—"}</td>
                    <td className="max-w-56 truncate px-4 py-3 text-xs text-slate-500">{row.note}</td>
                    <td
                      className={`px-4 py-3 text-sm font-extrabold ${
                        row.amount < 0 ? "text-rose-600" : "text-slate-800"
                      }`}
                    >
                      {inr(row.amount)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{relativeTime(row.created_at)}</td>
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
