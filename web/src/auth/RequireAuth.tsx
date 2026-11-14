import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";

/** Rutas privadas: sin sesión, al login. */
export function RequireAuth() {
  const { token } = useAuth();
  return token ? <Outlet /> : <Navigate to="/login" replace />;
}

/** Rutas de invitado (login/registro): con sesión, al dashboard. */
export function RedirectIfAuth() {
  const { token } = useAuth();
  return token ? <Navigate to="/dashboard" replace /> : <Outlet />;
}
