import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Bell, KeyRound, MessageSquareWarning, UserRound } from "lucide-react";
import { api } from "../lib/api";
import type { NotificationItem } from "../lib/types";
import { relativeTime } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import Alert from "../components/Alert";
import StatusPill from "../components/StatusPill";

interface ComplaintRow {
  id: number;
  subject: string;
  message: string;
  status: string;
  admin_reply: string | null;
  created_at: string;
}

export default function Profile() {
  const { user, refresh } = useAuth();
  const [profile, setProfile] = useState({ full_name: "", phone: "", city: "" });
  const [passwords, setPasswords] = useState({ current_password: "", new_password: "" });
  const [complaint, setComplaint] = useState({ subject: "", message: "" });
  const [complaints, setComplaints] = useState<ComplaintRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const [complaintNotice, setComplaintNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setProfile({ full_name: user.full_name, phone: user.phone ?? "", city: user.city ?? "" });
    }
  }, [user]);

  useEffect(() => {
    void (async () => {
      try {
        const [complaintRows, notificationRows] = await Promise.all([
          api<ComplaintRow[]>("/api/complaints"),
          api<{ items: NotificationItem[] }>("/api/notifications"),
        ]);
        setComplaints(complaintRows);
        setNotifications(notificationRows.items);
      } catch {
        /* non-critical */
      }
    })();
  }, []);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setProfileNotice(null);
    setError(null);
    try {
      await api("/api/auth/me", { method: "PATCH", body: profile });
      await refresh();
      setProfileNotice("Profile updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update your profile");
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordNotice(null);
    setError(null);
    try {
      await api("/api/auth/change-password", { method: "POST", body: passwords });
      setPasswords({ current_password: "", new_password: "" });
      setPasswordNotice("Password changed. Other sessions stay valid until they expire.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change your password");
    }
  };

  const submitComplaint = async (event: FormEvent) => {
    event.preventDefault();
    setComplaintNotice(null);
    setError(null);
    try {
      await api("/api/complaints", { method: "POST", body: complaint });
      setComplaintNotice("Complaint submitted. Our admin team will reply here.");
      setComplaint({ subject: "", message: "" });
      setComplaints(await api<ComplaintRow[]>("/api/complaints"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit the complaint");
    }
  };

  if (!user) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Profile &amp; settings</h1>
      <p className="mt-1 text-sm text-slate-500">
        Signed in as {user.email} · <span className="capitalize">{user.role}</span>
      </p>

      {error && (
        <div className="mt-4">
          <Alert kind="error">{error}</Alert>
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <UserRound size={16} /> Account details
          </h2>
          {profileNotice && (
            <div className="mt-3">
              <Alert kind="success">{profileNotice}</Alert>
            </div>
          )}
          <form onSubmit={saveProfile} className="mt-3 space-y-3">
            <div>
              <label className="label" htmlFor="profile-name">
                Full name
              </label>
              <input
                id="profile-name"
                className="input"
                value={profile.full_name}
                onChange={(event) => setProfile((prev) => ({ ...prev, full_name: event.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="profile-phone">
                Phone
              </label>
              <input
                id="profile-phone"
                className="input"
                value={profile.phone}
                onChange={(event) => setProfile((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="profile-city">
                City
              </label>
              <input
                id="profile-city"
                className="input"
                value={profile.city}
                onChange={(event) => setProfile((prev) => ({ ...prev, city: event.target.value }))}
              />
            </div>
            <button type="submit" className="btn-primary text-xs">
              Save changes
            </button>
          </form>
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <KeyRound size={16} /> Change password
          </h2>
          {passwordNotice && (
            <div className="mt-3">
              <Alert kind="success">{passwordNotice}</Alert>
            </div>
          )}
          <form onSubmit={changePassword} className="mt-3 space-y-3">
            <div>
              <label className="label" htmlFor="current-password">
                Current password
              </label>
              <input
                id="current-password"
                type="password"
                required
                className="input"
                value={passwords.current_password}
                onChange={(event) => setPasswords((prev) => ({ ...prev, current_password: event.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="new-password">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                required
                minLength={6}
                className="input"
                value={passwords.new_password}
                onChange={(event) => setPasswords((prev) => ({ ...prev, new_password: event.target.value }))}
              />
            </div>
            <button type="submit" className="btn-secondary text-xs">
              Update password
            </button>
          </form>
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <MessageSquareWarning size={16} /> Support &amp; complaints
          </h2>
          {complaintNotice && (
            <div className="mt-3">
              <Alert kind="success">{complaintNotice}</Alert>
            </div>
          )}
          <form onSubmit={submitComplaint} className="mt-3 space-y-3">
            <div>
              <label className="label" htmlFor="complaint-subject">
                Subject
              </label>
              <input
                id="complaint-subject"
                required
                minLength={3}
                className="input"
                placeholder="Entry gate issue"
                value={complaint.subject}
                onChange={(event) => setComplaint((prev) => ({ ...prev, subject: event.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="complaint-message">
                What happened?
              </label>
              <textarea
                id="complaint-message"
                required
                minLength={5}
                className="input min-h-20"
                value={complaint.message}
                onChange={(event) => setComplaint((prev) => ({ ...prev, message: event.target.value }))}
              />
            </div>
            <button type="submit" className="btn-primary text-xs">
              Submit complaint
            </button>
          </form>

          <div className="mt-4 space-y-2">
            {complaints.map((row) => (
              <div key={row.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-800">{row.subject}</p>
                  <StatusPill status={row.status} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{row.message}</p>
                {row.admin_reply && (
                  <p className="mt-1.5 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
                    <strong>Support:</strong> {row.admin_reply}
                  </p>
                )}
              </div>
            ))}
            {complaints.length === 0 && <p className="text-xs text-slate-500">You have not raised any complaints.</p>}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Bell size={16} /> Notifications
          </h2>
          <button
            type="button"
            className="btn-secondary mt-3 text-xs"
            onClick={() =>
              void api("/api/notifications/read-all", { method: "POST" }).then(() =>
                setNotifications((rows) => rows.map((row) => ({ ...row, is_read: true }))),
              )
            }
          >
            Mark all read
          </button>
          <div className="mt-3 space-y-2">
            {notifications.slice(0, 10).map((item) => (
              <div key={item.id} className={`rounded-xl border p-3 ${item.is_read ? "border-slate-200" : "border-brand-200 bg-brand-50/40"}`}>
                <p className="text-xs font-bold text-slate-800">{item.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{item.message}</p>
                <p className="mt-1 text-[10px] text-slate-400">{relativeTime(item.created_at)}</p>
              </div>
            ))}
            {notifications.length === 0 && <p className="text-xs text-slate-500">No notifications yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
