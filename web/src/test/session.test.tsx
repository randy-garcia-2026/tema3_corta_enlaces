import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { makeUrl, mockApi, storeSession } from "./fakeApi";
import { renderAt } from "./helpers";

describe("logout", () => {
  it("borra el token del almacenamiento, vuelve al login y no hace más llamadas", async () => {
    storeSession();
    const calls = mockApi([makeUrl("uno")]);
    const user = userEvent.setup();
    renderAt("/dashboard");
    await screen.findByRole("table");
    expect(localStorage.getItem("snap.session")).not.toBeNull();
    const callsBefore = calls.length;

    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(localStorage.getItem("snap.session")).toBeNull();
    expect(calls).toHaveLength(callsBefore);
    // Un cierre voluntario no es una "sesión caducada": no se muestra ese aviso.
    expect(screen.queryByText(/Tu sesión ha caducado/)).not.toBeInTheDocument();
  });

  it("tras cerrar sesión, volver a /dashboard exige login y no llama a la API", async () => {
    storeSession();
    mockApi([]);
    const user = userEvent.setup();
    const first = renderAt("/dashboard");
    await screen.findByText(/Todavía no has creado/);
    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    await screen.findByRole("heading", { name: "Iniciar sesión" });
    first.unmount();

    const calls = mockApi([]); // fetch limpio
    renderAt("/dashboard");
    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("el cierre es inmediato aunque la API no responda: no depende de ninguna llamada", async () => {
    storeSession();
    mockApi([], { listFailures: [500] });
    const user = userEvent.setup();
    renderAt("/dashboard");
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(localStorage.getItem("snap.session")).toBeNull();
  });
});

describe("sesión caducada", () => {
  it("si la API responde 401, el login explica que la sesión caducó", async () => {
    storeSession();
    mockApi([], { listFailures: [401] });
    renderAt("/dashboard");
    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Tu sesión ha caducado");
    expect(localStorage.getItem("snap.session")).toBeNull();
  });

  it("si al abrir la app el token guardado ya caducó, también lo explica", async () => {
    storeSession("a.eyJleHAiOjF9.b"); // exp = 1970
    mockApi([]);
    renderAt("/dashboard");
    expect(await screen.findByRole("status")).toHaveTextContent("Tu sesión ha caducado");
    expect(localStorage.getItem("snap.session")).toBeNull();
  });

  it("al volver a entrar, el aviso desaparece", async () => {
    storeSession();
    mockApi([], { listFailures: [401] });
    const user = userEvent.setup();
    renderAt("/dashboard");
    await screen.findByRole("status");

    mockApi([]);
    await user.type(screen.getByLabelText("Email"), "ana@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "clave-segura-1");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText(/Todavía no has creado/)).toBeInTheDocument();
    expect(screen.queryByText(/Tu sesión ha caducado/)).not.toBeInTheDocument();
  });
});
