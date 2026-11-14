/** Error devuelto por la API: `{ "error": "mensaje" }` con un código HTTP. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

let unauthorizedHandler: (() => void) | undefined;

/** Se invoca cuando una petición autenticada recibe 401 (token caducado o inválido). */
export function setUnauthorizedHandler(handler: (() => void) | undefined): void {
  unauthorizedHandler = handler;
}

export interface RequestOptions extends RequestInit {
  /** Si se indica, se envía como `Authorization: Bearer <token>`. */
  token?: string | null | undefined;
}

const NETWORK_ERROR = "No se pudo conectar con el servidor. Inténtalo de nuevo.";

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, ...init } = options;
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, NETWORK_ERROR);
  }

  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    if (res.status === 401 && token) unauthorizedHandler?.();
    const message =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : res.status >= 500
          ? "El servidor no está disponible ahora mismo. Inténtalo de nuevo en unos minutos."
          : `Error inesperado (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return body as T;
}
