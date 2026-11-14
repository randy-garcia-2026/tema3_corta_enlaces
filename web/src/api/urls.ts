import { request } from "./client";
import type { UrlItem } from "./types";

export const listUrls = (token: string): Promise<UrlItem[]> =>
  request<UrlItem[]>("/urls", { token });

export interface CreateUrlInput {
  url: string;
  /** Opcional: si se omite, el servidor genera un código aleatorio. */
  alias?: string;
  /** Opcional: instante ISO 8601 con zona horaria (debe ser futuro). */
  expiresAt?: string;
}

export const createUrl = (token: string, input: CreateUrlInput): Promise<UrlItem> =>
  request<UrlItem>("/urls", { method: "POST", token, body: JSON.stringify(input) });
