import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { makeUrl, mockApi, storeSession } from "./fakeApi";
import { renderAt } from "./helpers";

describe("errores al cargar la lista", () => {
  it("fallo del servidor: mensaje claro (sin códigos técnicos) y «Reintentar» recupera", async () => {
    storeSession();
    mockApi([makeUrl("ok")], { listFailures: [500] });
    const user = userEvent.setup();
    renderAt("/dashboard");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("El servidor no está disponible ahora mismo");
    expect(alert.textContent).not.toMatch(/500|undefined|\[object/);

    await user.click(within(alert).getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("link", { name: "/ok" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("errores al crear", () => {
  async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByText(/Todavía no has creado/);
    await user.type(screen.getByLabelText("URL larga"), "https://example.com/z");
    await user.click(screen.getByRole("button", { name: "Acortar" }));
  }

  it("servidor caído (500): aviso en el formulario y se conserva lo escrito", async () => {
    storeSession();
    mockApi([], { createFailure: 500 });
    const user = userEvent.setup();
    renderAt("/dashboard");
    await fillAndSubmit(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("El servidor no está disponible");
    expect(screen.getByLabelText("URL larga")).toHaveValue("https://example.com/z");
    expect(screen.getByRole("button", { name: "Acortar" })).toBeEnabled(); // se puede reintentar
  });

  it("sin conexión: dice que no se pudo conectar", async () => {
    storeSession();
    mockApi([], { createFailure: "network" });
    const user = userEvent.setup();
    renderAt("/dashboard");
    await fillAndSubmit(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar con el servidor");
  });
});

describe("errores en login y registro", () => {
  it("login con credenciales incorrectas muestra el mensaje del servidor", async () => {
    mockApi([]);
    const user = userEvent.setup();
    renderAt("/login");
    await user.type(screen.getByLabelText("Email"), "ana@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "equivocada1");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Credenciales incorrectas");
    expect(localStorage.getItem("snap.session")).toBeNull();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });

  it("login vacío: avisa en cada campo sin llamar a la API", async () => {
    const calls = mockApi([]);
    const user = userEvent.setup();
    renderAt("/login");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("Escribe tu email")).toBeInTheDocument();
    expect(screen.getByText("Escribe tu contraseña")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("registro con email repetido (409): el error sale en el campo email", async () => {
    mockApi([]);
    const user = userEvent.setup();
    renderAt("/register");
    await user.type(screen.getByLabelText("Nombre"), "Ana");
    await user.type(screen.getByLabelText("Email"), "ana@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "clave-segura-1");
    await user.click(screen.getByRole("button", { name: "Registrarme" }));
    expect(await screen.findByText("El email ya está registrado")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("registro con contraseña corta: se avisa antes de enviar", async () => {
    const calls = mockApi([]);
    const user = userEvent.setup();
    renderAt("/register");
    await user.type(screen.getByLabelText("Nombre"), "Ana");
    await user.type(screen.getByLabelText("Email"), "nueva@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "corta");
    await user.click(screen.getByRole("button", { name: "Registrarme" }));
    expect(await screen.findByText("La contraseña debe tener al menos 8 caracteres")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});
