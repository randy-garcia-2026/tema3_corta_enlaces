import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { makeUrl, mockApi, storeSession } from "./fakeApi";
import { renderAt } from "./helpers";

describe("URLs expiradas en la lista", () => {
  const urls = () => [
    makeUrl("activa", { expiresAt: "2099-01-01T00:00:00.000Z" }),
    makeUrl("vieja", { expiresAt: "2020-01-01T00:00:00.000Z", expired: true, clicks: 4 }),
    makeUrl("eterna"),
  ];

  it("se distinguen: badge «Expirada», fila atenuada y botón de copiar desactivado", async () => {
    storeSession();
    mockApi(urls());
    renderAt("/dashboard");
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");

    const [activa, vieja, eterna] = [rows[1]!, rows[2]!, rows[3]!];
    expect(vieja).toHaveClass("expired");
    expect(within(vieja).getByText("Expirada")).toBeInTheDocument();
    expect(within(vieja).getByRole("button", { name: "Copiar" })).toBeDisabled();
    expect(within(vieja).getByText(/^Expiró el/)).toBeInTheDocument();
    expect(within(vieja).getByText("4")).toBeInTheDocument(); // conserva sus clicks

    for (const row of [activa, eterna]) {
      expect(row).not.toHaveClass("expired");
      expect(within(row).queryByText("Expirada")).not.toBeInTheDocument();
      expect(within(row).getByRole("button", { name: "Copiar" })).toBeEnabled();
    }
    expect(within(activa).queryByText(/^Expiró/)).not.toBeInTheDocument();
    expect(within(eterna).getByText("Nunca")).toBeInTheDocument();
  });

  it("el resumen cuenta las expiradas", async () => {
    storeSession();
    mockApi(urls());
    renderAt("/dashboard");
    expect(await screen.findByText(/3 enlaces .* 1 expirada/)).toBeInTheDocument();
  });

  it("sin ninguna expirada, el resumen no las menciona", async () => {
    storeSession();
    mockApi([makeUrl("a"), makeUrl("b")]);
    renderAt("/dashboard");
    expect(await screen.findByText(/2 enlaces/)).toBeInTheDocument();
    expect(screen.queryByText(/expirada/)).not.toBeInTheDocument();
  });
});

describe("caducidad al crear", () => {
  it("envía expiresAt en ISO UTC a partir de la hora local elegida", async () => {
    storeSession();
    const calls = mockApi([]);
    const user = userEvent.setup();
    renderAt("/dashboard");
    await screen.findByText(/Todavía no has creado/);

    await user.type(screen.getByLabelText("URL larga"), "https://example.com/temporal");
    fireEvent.change(screen.getByLabelText("Caduca el (opcional)"), {
      target: { value: "2099-06-15T10:30" },
    });
    await user.click(screen.getByRole("button", { name: "Acortar" }));

    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      url: "https://example.com/temporal",
      expiresAt: new Date("2099-06-15T10:30").toISOString(),
    });
    expect(await screen.findByRole("link", { name: "/AbC1234" })).toBeInTheDocument();
    expect(screen.getByLabelText("Caduca el (opcional)")).toHaveValue("");
  });

  it("rechaza una fecha pasada antes de llamar a la API", async () => {
    storeSession();
    const calls = mockApi([]);
    const user = userEvent.setup();
    renderAt("/dashboard");
    await screen.findByText(/Todavía no has creado/);

    await user.type(screen.getByLabelText("URL larga"), "https://example.com/x");
    fireEvent.change(screen.getByLabelText("Caduca el (opcional)"), {
      target: { value: "2020-01-01T10:00" },
    });
    await user.click(screen.getByRole("button", { name: "Acortar" }));

    expect(await screen.findByText("La fecha de caducidad debe ser futura")).toBeInTheDocument();
    expect(screen.getByLabelText("Caduca el (opcional)")).toHaveAttribute("aria-invalid", "true");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("sin fecha, no envía expiresAt", async () => {
    storeSession();
    const calls = mockApi([]);
    const user = userEvent.setup();
    renderAt("/dashboard");
    await screen.findByText(/Todavía no has creado/);
    await user.type(screen.getByLabelText("URL larga"), "https://example.com/y");
    await user.click(screen.getByRole("button", { name: "Acortar" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")?.body).not.toHaveProperty("expiresAt");
  });
});
