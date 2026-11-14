import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { setUnauthorizedHandler } from "../api/client";
import type { AuthResult, User } from "../api/types";

const STORAGE_KEY = "snap.session";

interface Session {
  token: string;
  user: User;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  /** Guarda la sesión devuelta por login o registro. */
  signIn: (result: AuthResult) => void;
  /** Cierre voluntario: borra token y usuario. */
  signOut: () => void;
  /** true si la sesión se perdió por caducidad (para avisar en el login). */
  sessionExpired: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Devuelve el instante de expiración (ms) del JWT, o undefined si no se puede leer. */
function tokenExpiry(token: string): number | undefined {
  try {
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === "number" ? exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

function loadSession(): { session: Session | null; expired: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { session: null, expired: false };
    const session = JSON.parse(raw) as Session;
    const expiry = tokenExpiry(session.token);
    if (!session.user || expiry === undefined) {
      localStorage.removeItem(STORAGE_KEY);
      return { session: null, expired: false };
    }
    if (expiry <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return { session: null, expired: true };
    }
    return { session, expired: false };
  } catch {
    return { session: null, expired: false };
  }
}

function saveSession(session: Session | null): void {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sin almacenamiento (modo privado): la sesión dura hasta recargar.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(loadSession);
  const [session, setSession] = useState<Session | null>(initial.session);
  const [sessionExpired, setSessionExpired] = useState(initial.expired);

  const signIn = useCallback((result: AuthResult) => {
    const next = { token: result.token, user: result.user };
    saveSession(next);
    setSession(next);
    setSessionExpired(false);
  }, []);

  const signOut = useCallback(() => {
    saveSession(null);
    setSession(null);
    setSessionExpired(false);
  }, []);

  const expireSession = useCallback(() => {
    saveSession(null);
    setSession(null);
    setSessionExpired(true);
  }, []);

  // Un 401 en una petición autenticada significa sesión caducada: se cierra y RequireAuth lleva al login.
  useEffect(() => {
    setUnauthorizedHandler(expireSession);
    return () => setUnauthorizedHandler(undefined);
  }, [expireSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      signIn,
      signOut,
      sessionExpired,
    }),
    [session, sessionExpired, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
