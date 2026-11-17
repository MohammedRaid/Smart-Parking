import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Bell, ChevronDown, LogOut, Menu, ParkingCircle, UserRound, X } from "lucide-react";
import { homeFor, useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { relativeTime } from "../lib/format";
import type { NotificationItem } from "../lib/types";

const customerLinks = [
  { to: "/map", label: "Find parking" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/bookings", label: "My bookings" },
];

const landownerLinks = [
  { to: "/landowner", label: "Dashboard" },
  { to: "/landowner/listings/new", label: "Add parking" },
  { to: "/landowner/scanner", label: "Scan QR" },
  { to: "/landowner/earnings", label: "Earnings" },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  const links =
    user?.role === "landowner" ? landownerLinks : user?.role === "admin" ? [{ to: "/admin", label: "Admin" }] : customerLinks;

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api<{ items: NotificationItem[] }>("/api/notifications", { signal: undefined });
        if (!cancelled) setNotifications(data.items);
      } catch {
        /* ignore notification errors */
      }
    };
    void load();
    const timer = window.setInterval(load, 45000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user]);

  const unread = notifications.filter((item) => !item.is_read).length;

  const markAllRead = async () => {
    try {
      await api("/api/notifications/read-all", { method: "POST" });
      setNotifications((rows) => rows.map((row) => ({ ...row, is_read: true })));
    } catch {
      /* ignore */
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 text-brand-800">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-700 text-white">
            <ParkingCircle size={20} />
          </span>
          <span className="text-lg font-extrabold tracking-tight">
            Smart<span className="text-brand-600">Park</span>
          </span>
        </Link>

        <nav className="ml-2 hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  isActive ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {!user && (
            <>
              <Link to="/map" className="hidden text-sm font-semibold text-slate-600 hover:text-brand-700 sm:block">
                Explore map
              </Link>
              <Link to="/landowner/login" className="hidden text-sm font-semibold text-slate-600 hover:text-brand-700 md:block">
                List your land
              </Link>
              <Link to="/login" className="btn-secondary">
                Log in
              </Link>
              <Link to="/register" className="btn-primary">
                Sign up
              </Link>
            </>
          )}

          {user && (
            <>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowNotifications((value) => !value)}
                  className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                  aria-label="Notifications"
                >
                  <Bell size={18} />
                  {unread > 0 && (
                    <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                      {unread}
                    </span>
                  )}
                </button>
                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                      <span className="text-sm font-bold">Notifications</span>
                      <button type="button" onClick={markAllRead} className="text-xs font-semibold text-brand-700">
                        Mark all read
                      </button>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 && (
                        <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing here yet.</p>
                      )}
                      {notifications.slice(0, 12).map((item) => (
                        <div
                          key={item.id}
                          className={`border-b border-slate-50 px-4 py-3 text-sm ${item.is_read ? "" : "bg-brand-50/50"}`}
                        >
                          <p className="font-semibold text-slate-800">{item.title}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{item.message}</p>
                          <p className="mt-1 text-[11px] text-slate-400">{relativeTime(item.created_at)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((value) => !value)}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 py-1.5 pl-1.5 pr-2.5 hover:bg-slate-50"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-100 text-xs font-bold text-brand-800">
                    {user.full_name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden max-w-24 truncate text-sm font-semibold text-slate-700 sm:block">
                    {user.full_name.split(" ")[0]}
                  </span>
                  <ChevronDown size={14} className="text-slate-400" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl">
                    <div className="px-4 py-2">
                      <p className="truncate text-sm font-bold text-slate-800">{user.full_name}</p>
                      <p className="truncate text-xs capitalize text-slate-500">{user.role}</p>
                    </div>
                    <Link
                      to="/profile"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                      <UserRound size={15} /> Profile & settings
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        logout();
                        navigate("/");
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
                    >
                      <LogOut size={15} /> Log out
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600 lg:hidden"
                aria-label="Menu"
              >
                {open ? <X size={18} /> : <Menu size={18} />}
              </button>
            </>
          )}
        </div>
      </div>

      {open && user && (
        <div className="border-t border-slate-200 bg-white px-4 py-2 lg:hidden">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {link.label}
            </Link>
          ))}
          <Link
            to={homeFor(user.role)}
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-brand-700"
          >
            Go to my dashboard
          </Link>
        </div>
      )}
    </header>
  );
}
