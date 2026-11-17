import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, getToken, setToken } from "../lib/api";
import type { Role, User } from "../lib/types";

interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

interface RegisterInput {
  full_name: string;
  email: string;
  password: string;
  phone?: string;
  city?: string;
  role: Exclude<Role, "admin">;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, role: Role) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await api<User>("/api/auth/me"));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const signOut = () => setUser(null);
    window.addEventListener("smartpark:signed-out", signOut);
    return () => window.removeEventListener("smartpark:signed-out", signOut);
  }, [refresh]);

  const login = useCallback(async (email: string, password: string, role: Role) => {
    const result = await api<LoginResponse>(`/api/auth/login/${role}`, {
      method: "POST",
      body: { email, password },
      auth: false,
    });
    setToken(result.access_token);
    setUser(result.user);
    return result.user;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const result = await api<LoginResponse>("/api/auth/register", {
      method: "POST",
      body: input,
      auth: false,
    });
    setToken(result.access_token);
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refresh }),
    [user, loading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

export function homeFor(role: Role | undefined): string {
  if (role === "landowner") return "/landowner";
  if (role === "admin") return "/admin";
  return "/dashboard";
}

export function loginPathFor(role?: Role | Role[]): string {
  const target = Array.isArray(role) ? role[0] : role;
  if (target === "landowner") return "/landowner/login";
  if (target === "admin") return "/admin/login";
  return "/login";
}
