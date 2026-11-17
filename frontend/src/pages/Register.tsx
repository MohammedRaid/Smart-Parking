import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Loader2, UserPlus } from "lucide-react";
import AuthShell from "../components/AuthShell";
import Alert from "../components/Alert";
import { homeFor, useAuth } from "../context/AuthContext";

export default function Register({ role = "customer" }: { role?: "customer" | "landowner" }) {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", city: "", password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const update = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.password !== form.confirm) {
      setError("Passwords do not match");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
        city: form.city.trim() || undefined,
        role,
      });
      navigate(role === "landowner" ? "/landowner" : "/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      variant={role}
      title={role === "landowner" ? "List your" : "Join"}
      accented={role === "landowner" ? "land" : "SmartPark"}
      subtitle={
        role === "landowner"
          ? "Create a landowner account and start renting your unused space."
          : "Create a free account to reserve parking in seconds."
      }
      footer={
        role === "landowner" ? (
          <span>
            Already listing?{" "}
            <Link to="/landowner/login" className="font-bold text-brand-700">
              Sign in
            </Link>
          </span>
        ) : (
          <span>
            Already have an account?{" "}
            <Link to="/login" className="font-bold text-brand-700">
              Sign in
            </Link>
          </span>
        )
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}
        <div>
          <label className="label" htmlFor="full_name">
            Full name
          </label>
          <input id="full_name" required className="input" value={form.full_name} onChange={update("full_name")} placeholder="Priya Nair" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input id="email" type="email" required className="input" value={form.email} onChange={update("email")} placeholder="you@example.com" />
          </div>
          <div>
            <label className="label" htmlFor="phone">
              Phone
            </label>
            <input id="phone" className="input" value={form.phone} onChange={update("phone")} placeholder="+91 98450 00000" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="city">
            City
          </label>
          <input id="city" className="input" value={form.city} onChange={update("city")} placeholder="Bengaluru" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              className="input"
              value={form.password}
              onChange={update("password")}
              placeholder="At least 6 characters"
            />
          </div>
          <div>
            <label className="label" htmlFor="confirm">
              Confirm password
            </label>
            <input id="confirm" type="password" required className="input" value={form.confirm} onChange={update("confirm")} />
          </div>
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
          {busy ? "Creating account…" : role === "landowner" ? "Create landowner account" : "Create account"}
        </button>
        {role === "customer" && (
          <p className="text-center text-xs text-slate-500">
            Want to rent out land instead?{" "}
            <Link to="/landowner/register" className="font-bold text-brand-700">
              Landowner sign up
            </Link>
          </p>
        )}
      </form>
    </AuthShell>
  );
}
