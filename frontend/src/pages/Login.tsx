import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Loader2, LogIn } from "lucide-react";
import AuthShell from "../components/AuthShell";
import Alert from "../components/Alert";
import { homeFor, useAuth } from "../context/AuthContext";
import type { Role } from "../lib/types";

const DEMOS: Record<Role, { email: string; password: string; label: string }> = {
  customer: { email: "priya@example.com", password: "password123", label: "Customer demo" },
  landowner: { email: "suresh@example.com", password: "password123", label: "Landowner demo" },
  admin: { email: "admin@smartpark.in", password: "Admin@123", label: "Admin demo" },
};

export default function Login({ role = "customer" }: { role?: Role }) {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const from = (location.state as { from?: string } | null)?.from;
  const demo = DEMOS[role];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const signedIn = await login(email.trim(), password, role);
      navigate(from && signedIn.role === role ? from : homeFor(signedIn.role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      variant={role}
      title={role === "admin" ? "Admin" : role === "landowner" ? "Landowner" : "Welcome"}
      accented={role === "admin" ? "console" : "back"}
      subtitle={
        role === "admin"
          ? "Sign in to moderate listings, users and payments."
          : role === "landowner"
            ? "Manage your parking listings, reservations and earnings."
            : "Sign in to reserve parking and view your bookings."
      }
      footer={
        role === "landowner" ? (
          <span>
            New here?{" "}
            <Link to="/landowner/register" className="font-bold text-brand-700">
              Create a landowner account
            </Link>
          </span>
        ) : role === "admin" ? (
          <span className="text-xs">Administrator access only. Use the demo credentials for this project.</span>
        ) : (
          <span>
            Don&apos;t have an account?{" "}
            <Link to="/register" className="font-bold text-brand-700">
              Sign up free
            </Link>
          </span>
        )
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}
        <div>
          <label className="label" htmlFor="email">
            Email address
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            className="input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            className="input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3.5">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{demo.label} credentials</p>
        <p className="mt-1 font-mono text-xs text-slate-600">
          {demo.email} / {demo.password}
        </p>
        <button
          type="button"
          onClick={() => {
            setEmail(demo.email);
            setPassword(demo.password);
          }}
          className="mt-2 text-xs font-bold text-brand-700 hover:text-brand-800"
        >
          Fill demo credentials
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
        {role !== "customer" && (
          <Link to="/login" className="hover:text-brand-700">
            Customer login
          </Link>
        )}
        {role !== "landowner" && (
          <Link to="/landowner/login" className="hover:text-brand-700">
            Landowner login
          </Link>
        )}
        {role !== "admin" && (
          <Link to="/admin/login" className="hover:text-brand-700">
            Admin login
          </Link>
        )}
      </div>
    </AuthShell>
  );
}
