export interface User {
  id: number;
  email: string;
  name: string;
  createdAt: string;
}

export interface AuthResult {
  user: User;
  token: string;
}

export interface UrlItem {
  id: number;
  code: string;
  longUrl: string;
  shortUrl: string;
  userId: number | null;
  createdAt: string;
  /** Total de clicks de todo el histórico. */
  clicks: number;
  /** null si nunca se ha usado. */
  lastClickAt: string | null;
  /** Instante (ISO, UTC) en que deja de redirigir; null si no caduca. */
  expiresAt: string | null;
  /** Calculado por el servidor con su reloj: true si ya ha caducado. */
  expired: boolean;
}
