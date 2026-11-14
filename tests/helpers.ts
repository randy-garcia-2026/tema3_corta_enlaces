import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

export async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

export function close(server: Server): Promise<void> {
  return new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
}

/** Registra un usuario vía HTTP y devuelve su token y su id. */
export async function registerUser(
  baseUrl: string,
  email: string,
): Promise<{ token: string; id: number }> {
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "clave-segura-1", name: "Test" }),
  });
  if (res.status !== 201) throw new Error(`Registro fallido: ${res.status}`);
  const body = (await res.json()) as { token: string; user: { id: number } };
  return { token: body.token, id: body.user.id };
}

export const bearer = (token: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
});
