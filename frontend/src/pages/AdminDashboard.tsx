import { useCallback, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  Ban,
  Building2,
  CheckCircle2,
  CreditCard,
  IndianRupee,
  RefreshCw,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import { api } from "../lib/api";
import type { AdminStats, Booking, ParkingLocation } from "../lib/types";
import { inr, prettyDate, prettyTime, relativeTime } from "../lib/format";
import Alert from "../components/Alert";
import Spinner from "../components/Spinner";
import StatusPill from "../components/StatusPill";
import { useRealtimeEvents } from "../context/RealtimeContext";

interface AdminUser {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  is_blocked: boolean;
  created_at: string;
  bookings: number;
  spent: number;
  listings: number;
}

interface AdminPayment {
  id: number;
  receipt_no: string;
  amount: number;
  status: string;
  mode: string;
  method: string | null;
  created_at: string;
  customer: string | null;
  location: string | null;
  booking_code: string | null;
}

interface ComplaintRow {
  id: number;
  subject: string;
  message: string;
  status: string;
  admin_reply: string | null;
  created_at: string;
  user: string;
  email: string;
}

type Tab = "overview" | "listings" | "users" | "bookings" | "payments" | "complaints";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "listings", label: "Listings" },
  { id: "users", label: "Users" },
  { id: "bookings", label: "Bookings" },
  { id: "payments", label: "Payments" },
  { id: "complaints", label: "Complaints" },
];

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [listings, setListings] = useState<ParkingLocation[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [complaints, setComplaints] = useState<ComplaintRow[]>([]);
  const [replyFor, setReplyFor] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [summary, listingRows, userRows, bookingRows, paymentRows, complaintRows] = await Promise.all([
        api<AdminStats>("/api/admin/stats"),
        api<ParkingLocation[]>("/api/admin/parking"),
        api<AdminUser[]>("/api/admin/users"),
        api<Booking[]>("/api/admin/bookings"),
        api<AdminPayment[]>("/api/admin/payments"),
        api<ComplaintRow[]>("/api/admin/complaints"),
      ]);
      setStats(summary);
      setListings(listingRows);
      setUsers(userRows);
      setBookings(bookingRows);
      setPayments(paymentRows);
      setComplaints(complaintRows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the admin console");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeEvents(["listing_created", "booking_paid", "booking_cancelled"], () => {
    void load();
  });

  const act = async (path: string, body?: Record<string, unknown>, message?: string) => {
    try {
      await api(path, { method: "POST", body });
      if (message) setNotice(message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  };

  const reject = async (listing: ParkingLocation) => {
    const reason = window.prompt(`Why are you rejecting "${listing.name}"?`);
    if (!reason || reason.trim().length < 3) return;
    await act(`/api/admin/parking/${listing.id}/reject`, { reason }, `${listing.name} rejected.`);
  };

  const sendReply = async (complaint: ComplaintRow) => {
    if (replyText.trim().length < 2) return;
    await act(
      `/api/admin/complaints/${complaint.id}/reply`,
      { reply: replyText.trim(), status: "resolved" },
      "Reply sent to the customer.",
    );
    setReplyFor(null);
    setReplyText("");
  };

  if (loading) return <Spinner label="Loading admin console…" />;

  const pendingListings = listings.filter((listing) => listing.status === "pending");

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-700">
            <ShieldCheck size={13} /> Admin console
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Platform operations</h1>
          <p className="mt-1 text-sm text-slate-500">Moderate listings, monitor payments and support customers.</p>
        </div>
        <button type="button" onClick={() => void load()} className="btn-secondary text-xs">
          <RefreshCw size={14} /> Refresh data
        </button>
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

      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              tab === item.id
                ? "bg-brand-700 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {item.label}
            {item.id === "listings" && pendingListings.length > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 text-[10px] text-amber-950">
                {pendingListings.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {stats && tab === "overview" && (
        <div className="mt-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: <Users size={18} />, label: "Customers", value: String(stats.users.customers) },
              { icon: <Building2 size={18} />, label: "Landowners", value: String(stats.users.landowners) },
              { icon: <IndianRupee size={18} />, label: "Platform revenue", value: inr(stats.revenue.platform) },
              { icon: <AlertTriangle size={18} />, label: "Open complaints", value: String(stats.complaints_open) },
            ].map((card) => (
              <div key={card.label} className="card p-4">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-700">{card.icon}</span>
                <p className="mt-3 text-xl font-extrabold text-slate-900">{card.value}</p>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{card.label}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Bookings today", value: stats.bookings.today },
              { label: "Vehicles parked now", value: stats.bookings.parked },
              { label: "Upcoming reservations", value: stats.bookings.reserved },
              { label: "Cancelled bookings", value: stats.bookings.cancelled },
            ].map((row) => (
              <div key={row.label} className="card flex items-center justify-between p-4">
                <span className="text-xs font-semibold text-slate-500">{row.label}</span>
                <span className="text-lg font-extrabold text-slate-900">{row.value}</span>
              </div>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="card p-5">
              <h2 className="text-sm font-bold text-slate-900">Revenue &amp; bookings trend</h2>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.monthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={52} />
                    <Tooltip
                      formatter={(value, name) => (name === "revenue" ? inr(Number(value ?? 0)) : Number(value ?? 0))}
                      contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                    />
                    <Bar dataKey="revenue" fill="#0d9488" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="bookings" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-center text-xs">
                <div className="rounded-xl bg-slate-50 p-2.5">
                  <p className="font-extrabold text-slate-900">{inr(stats.revenue.gross)}</p>
                  <p className="text-slate-500">Gross collected</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-2.5">
                  <p className="font-extrabold text-slate-900">{inr(stats.revenue.platform)}</p>
                  <p className="text-slate-500">Platform fee</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-2.5">
                  <p className="font-extrabold text-slate-900">{inr(stats.revenue.refunds)}</p>
                  <p className="text-slate-500">Refunded</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="card p-5">
                <h2 className="text-sm font-bold text-slate-900">Listing moderation</h2>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl bg-amber-50 p-2.5">
                    <p className="text-lg font-extrabold text-amber-700">{stats.listings.pending}</p>
                    <p className="text-amber-700/80">Pending</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-2.5">
                    <p className="text-lg font-extrabold text-emerald-700">{stats.listings.approved}</p>
                    <p className="text-emerald-700/80">Live</p>
                  </div>
                  <div className="rounded-xl bg-rose-50 p-2.5">
                    <p className="text-lg font-extrabold text-rose-700">{stats.listings.rejected}</p>
                    <p className="text-rose-700/80">Rejected</p>
                  </div>
                </div>
              </div>

              <div className="card p-5">
                <h2 className="text-sm font-bold text-slate-900">Most used locations</h2>
                <div className="mt-2 space-y-2">
                  {stats.top_locations.map((row) => (
                    <div key={`${row.name}-${row.city}`} className="flex items-center justify-between text-xs">
                      <span className="truncate text-slate-600">
                        {row.name} <span className="text-slate-400">· {row.city}</span>
                      </span>
                      <span className="font-bold text-slate-800">{row.bookings}</span>
                    </div>
                  ))}
                  {stats.top_locations.length === 0 && <p className="text-xs text-slate-500">No bookings yet.</p>}
                </div>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-bold text-slate-900">Latest bookings</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="text-slate-400">
                  <tr>
                    <th className="py-2">Code</th>
                    <th className="py-2">Customer</th>
                    <th className="py-2">Location</th>
                    <th className="py-2">Window</th>
                    <th className="py-2">Amount</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent_bookings.map((booking) => (
                    <tr key={booking.id} className="border-t border-slate-50">
                      <td className="py-2 font-mono font-semibold">{booking.code}</td>
                      <td className="py-2">{booking.customer?.full_name}</td>
                      <td className="max-w-40 truncate py-2">{booking.location?.name}</td>
                      <td className="py-2">
                        {prettyDate(booking.booking_date)} · {prettyTime(booking.start_time)}
                      </td>
                      <td className="py-2 font-bold">{inr(booking.amount)}</td>
                      <td className="py-2">
                        <StatusPill status={booking.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "listings" && (
        <div className="mt-5 space-y-3">
          {listings.map((listing) => (
            <article key={listing.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex gap-3">
                  {listing.images[0] ? (
                    <img src={listing.images[0]} alt="" className="h-16 w-20 rounded-lg object-cover" />
                  ) : (
                    <div className="grid h-16 w-20 place-items-center rounded-lg bg-slate-100 text-[10px] font-bold text-slate-400">
                      No photo
                    </div>
                  )}
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900">{listing.name}</h3>
                      <StatusPill status={listing.status} />
                    </div>
                    <p className="text-xs text-slate-500">
                      {listing.address}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Owner: {listing.owner?.full_name} ({listing.owner?.email}) · {listing.total_slots} slots ·{" "}
                      {inr(listing.price_hourly)}/hr · {listing.stats?.total_bookings ?? 0} bookings ·{" "}
                      {inr(listing.stats?.revenue ?? 0)} revenue
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {listing.status !== "approved" && (
                    <button
                      type="button"
                      onClick={() => void act(`/api/admin/parking/${listing.id}/approve`, undefined, `${listing.name} approved.`)}
                      className="btn-primary px-3 py-1.5 text-xs"
                    >
                      <CheckCircle2 size={13} /> Approve
                    </button>
                  )}
                  {listing.status !== "rejected" && (
                    <button
                      type="button"
                      onClick={() => void reject(listing)}
                      className="btn-secondary px-3 py-1.5 text-xs text-rose-600"
                    >
                      <XCircle size={13} /> Reject
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
          {listings.length === 0 && <p className="text-sm text-slate-500">No listings submitted yet.</p>}
        </div>
      )}

      {tab === "users" && (
        <div className="card mt-5 overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Activity</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3">
                    <p className="text-xs font-bold text-slate-800">{user.full_name}</p>
                    {user.is_blocked && <span className="badge bg-rose-50 text-rose-700">Blocked</span>}
                  </td>
                  <td className="px-4 py-3 text-xs capitalize">{user.role}</td>
                  <td className="px-4 py-3 text-xs">
                    <p>{user.email}</p>
                    <p className="text-slate-400">{user.phone ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {user.role === "landowner" ? `${user.listings} listings` : `${user.bookings} bookings · ${inr(user.spent)}`}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(user.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                  </td>
                  <td className="px-4 py-3">
                    {user.role !== "admin" && (
                      <button
                        type="button"
                        onClick={() =>
                          void act(
                            `/api/admin/users/${user.id}/${user.is_blocked ? "unblock" : "block"}`,
                            undefined,
                            `${user.full_name} ${user.is_blocked ? "unblocked" : "blocked"}.`,
                          )
                        }
                        className={`btn-secondary px-2.5 py-1.5 text-xs ${user.is_blocked ? "text-emerald-700" : "text-rose-600"}`}
                      >
                        <Ban size={12} /> {user.is_blocked ? "Unblock" : "Block"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "bookings" && (
        <div className="card mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Location / slot</th>
                <th className="px-4 py-3">Window</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs font-semibold">{booking.code}</td>
                  <td className="px-4 py-3 text-xs">{booking.customer?.full_name}</td>
                  <td className="max-w-48 px-4 py-3 text-xs">
                    <p className="truncate">{booking.location?.name}</p>
                    <p className="text-slate-400">Slot {booking.slot?.label}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {prettyDate(booking.booking_date)}
                    <br />
                    <span className="text-slate-400">
                      {prettyTime(booking.start_time)}–{prettyTime(booking.end_time)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-bold">{inr(booking.amount)}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={booking.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "payments" && (
        <div className="card mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Receipt</th>
                <th className="px-4 py-3">Booking</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">When</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs font-semibold">{payment.receipt_no}</td>
                  <td className="px-4 py-3 font-mono text-xs">{payment.booking_code}</td>
                  <td className="px-4 py-3 text-xs">{payment.customer}</td>
                  <td className="px-4 py-3 text-xs uppercase">
                    <span className="inline-flex items-center gap-1">
                      <CreditCard size={12} /> {payment.method ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-bold">{inr(payment.amount)}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={payment.status} />
                    {payment.mode === "mock" && <span className="ml-1 text-[10px] font-bold text-amber-600">TEST</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{relativeTime(payment.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "complaints" && (
        <div className="mt-5 space-y-3">
          {complaints.map((complaint) => (
            <article key={complaint.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">{complaint.subject}</h3>
                    <StatusPill status={complaint.status} />
                  </div>
                  <p className="text-xs text-slate-500">
                    {complaint.user} · {complaint.email} · {relativeTime(complaint.created_at)}
                  </p>
                </div>
                {complaint.status === "open" && (
                  <button
                    type="button"
                    onClick={() => {
                      setReplyFor(replyFor === complaint.id ? null : complaint.id);
                      setReplyText(complaint.admin_reply ?? "");
                    }}
                    className="btn-secondary px-3 py-1.5 text-xs"
                  >
                    Reply
                  </button>
                )}
              </div>
              <p className="mt-2 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">{complaint.message}</p>
              {complaint.admin_reply && (
                <p className="mt-2 rounded-xl bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800">
                  <strong>Admin reply:</strong> {complaint.admin_reply}
                </p>
              )}
              {replyFor === complaint.id && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    className="input flex-1"
                    placeholder="Type your reply…"
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                  />
                  <button type="button" onClick={() => void sendReply(complaint)} className="btn-primary text-xs">
                    Send reply
                  </button>
                </div>
              )}
            </article>
          ))}
          {complaints.length === 0 && <p className="text-sm text-slate-500">No complaints raised.</p>}
        </div>
      )}
    </div>
  );
}
