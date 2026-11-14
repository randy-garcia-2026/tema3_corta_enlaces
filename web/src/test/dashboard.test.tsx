import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { makeUrl, mockApi, storeSession } from "./fakeApi";
import { renderAt } from "./helpers";

describe("autenticación", () => {
  it("sin token, /dashboard redirige al login y no llama a la API", async () => {
    const calls = mockApi([]);
    renderAt("/dashboard");
    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("con un token caducado también va al login", async () => {
    storeSession("a.eyJleHAiOjF9.b"); // exp = 1970
    mockApi([]);
    renderAt("/dashboard");
    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
  });

  it("si la API responde 401, cierra la sesión y vuelve al login", async () => {
    storeSession();
    mockApi([], { listFailures: [401] });
    renderAt("/dashboard");
    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(localStorage.getItem("snap.session")).toBeNull();
  });
});

describe("lista de URLs", () => {
  it("muestra las URLs del usuario con clicks y envía el Bearer token", async () => {
    const token = storeSession();
    const calls = mockApi([
      makeUrl("docs-snap", { clicks: 5, lastClickAt: "2026-11-14T12:00:00.000Z" }),
      makeUrl("HcQkGaM", { clicks: 0 }),
    ]);
    renderAt("/dashboard");

    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3); // cabecera + 2
    expect(within(rows[1]!).getByRole("link", { name: "/docs-snap" })).toHaveAttribute(
      "href",
      "http://localhost:3000/docs-snap",
    );
    expect(within(rows[1]!).getByText("https://example.com/docs-snap")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("5")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("—")).toBeInTheDocument(); // sin último click
    expect(screen.getByText(/2 enlaces · 5 clicks/)).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();

    expect(calls[0]).toMatchObject({ method: "GET", path: "/urls", authorization: `Bearer ${token}` });
  });

  it("estado vacío para un usuario sin URLs", async () => {
    storeSession();
    mockApi([]);
    renderAt("/dashboard");
    expect(await screen.findByText(/Todavía no has creado ningún enlace/)).toBeInTheDocument();
  });
});

describe("crear una URL", () => {
  it("con alias: envía {url, alias}, avisa y recarga la lista con la nueva", async () => {
    storeSession();
    const calls = mockApi([makeUrl("existente")]);
    const user = userEvent.setup();
    renderAt("/dashboard");
    await screen.findByRole("table");

    await user.type(screen.getByLabelText("URL larga"), "https://example.com/nueva");
    await user.type(screen.getByLabelText("Alias (opcional)"), "mi-alias");
    await user.click(screen.getByRole("button", { name: "Acortar" }));

    expect(await screen.findByRole("status")).toHaveTextContent("http://localhost:3000/mi-alias");
    const post = calls.find((c) => c.method === "POST");
    expect(post?.body).toEqual({ url: "https://example.com/nueva", alias: "mi-alias" });
    expect(await screen.findByRole("link", { name: "/mi-alias" })).toBeInTheDocument();
    expect(screen.getByLabelText("URL larga")).toHaveValue(""); // formulario limpio
  });

  it("sin alias: no envía el campo alias", async () => {
    storeSession();
    const calls = mockApi([]);
    const user = userEvent.setup();
    renderAt("/dashboard");
    await screen.findByText(/Todavía no has creado/);

    await user.type(screen.getByLabelText("URL larga"), "www.wikipedia.org");
    await user.click(screen.getByRole("button", { name: "Acortar" }));

    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ url: "www.wikipedia.org" });
    expect(await screen.findByRole("link", { name: "/AbC1234" })).toBeInTheDocument();
  });

  it("alias ya usado (409): el error sale en el campo alias y se conserva lo escrito", async () => {
    storeSession();
    mockApi([]);
    const user = userEvent.setup();
    renderAt("/dashboard");
    await screen.findByText(/Todavía no has creado/);

    await user.type(screen.getByLabelText("URL larga"), "https://example.com/x");
    await user.type(screen.getByLabelText("Alias (opcional)"), "ocupado");
    await user.click(screen.getByRole("button", { name: "Acortar" }));

    expect(await screen.findByText("El alias ya está en uso")).toBeInTheDocument();
    expect(screen.getByLabelText("Alias (opcional)")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("URL larga")).toHaveValue("https://example.com/x");
  });

  it("valida en el cliente antes de llamar a la API", async () => {
    storeSession();
    const calls = mockApi([]);
    const user = userEvent.setup();
    renderAt("/dashboard");
    await screen.findByText(/Todavía no has creado/);

    await user.click(screen.getByRole("button", { name: "Acortar" }));
    expect(await screen.findByText("Escribe la URL que quieres acortar")).toBeInTheDocument();

    await user.type(screen.getByLabelText("URL larga"), "https://example.com");
    await user.type(screen.getByLabelText("Alias (opcional)"), "a b");
    await user.click(screen.getByRole("button", { name: "Acortar" }));
    expect(await screen.findByText(/Solo letras, números/)).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });
});
