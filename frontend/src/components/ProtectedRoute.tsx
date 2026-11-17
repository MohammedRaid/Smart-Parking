import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { homeFor, loginPathFor, useAuth } from "../context/AuthContext";
import type { Role } from "../lib/types";
import Spinner from "./Spinner";

interface ProtectedRouteProps {
  roles: Role[];
  children: ReactNode;
}

export default function ProtectedRoute({ roles, children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Spinner label="Checking your session…" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={loginPathFor(roles)} state={{ from: location.pathname + location.search }} replace />;
  }

  if (!roles.includes(user.role)) {
    return <Navigate to={homeFor(user.role)} replace />;
  }

  return <>{children}</>;
}
