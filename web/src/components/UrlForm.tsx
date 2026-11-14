import { useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import { createUrl } from "../api/urls";
import { useAuth } from "../auth/AuthContext";
import { Field } from "./Field";

const ALIAS_PATTERN = /^[A-Za-z0-9_-]+$/;

// Mismas reglas que el servidor (urls.service.ts).
function validateUrl(value: string): string | undefined {
  return value.trim() ? undefined : "Escribe la URL que quieres acortar";
}

function validateAlias(value: string): string | undefined {
  const alias = value.trim();
  if (!alias) return undefined; // opcional
  if (alias.length < 3 || alias.length > 32) return "El alias debe tener entre 3 y 32 caracteres";
  if (!ALIAS_PATTERN.test(alias)) return "Solo letras, números, guiones y guiones bajos";
  return undefined;
}

/** Devuelve el instante ISO de un <input type="datetime-local"> (hora local), o un error. */
function parseExpiration(value: string): { iso?: string; error?: string } {
  if (!value) return {}; // opcional
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { error: "La fecha de caducidad no es válida" };
  if (date.getTime() <= Date.now()) return { error: "La fecha de caducidad debe ser futura" };
  return { iso: date.toISOString() };
}

export function UrlForm({ onCreated }: { onCreated: () => void }) {
  const { token } = useAuth();
  const [url, setUrl] = useState("");
  const [alias, setAlias] = useState("");
  const [expires, setExpires] = useState("");
  const [errors, setErrors] = useState<{
    url?: string | undefined;
    alias?: string | undefined;
    expires?: string | undefined;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    const expiration = parseExpiration(expires);
    const next = { url: validateUrl(url), alias: validateAlias(alias), expires: expiration.error };
    setErrors(next);
    setFormError(null);
    setCreated(null);
    if (next.url || next.alias || next.expires) return;

    setSubmitting(true);
    try {
      const trimmedAlias = alias.trim();
      const item = await createUrl(token, {
        url: url.trim(),
        ...(trimmedAlias ? { alias: trimmedAlias } : {}),
        ...(expiration.iso ? { expiresAt: expiration.iso } : {}),
      });
      setCreated(item.shortUrl);
      setUrl("");
      setAlias("");
      setExpires("");
      onCreated();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Ocurrió un error inesperado";
      // 409 (alias en uso) es un problema del campo alias; el resto, del formulario.
      if (err instanceof ApiError && err.status === 409) setErrors({ alias: message });
      else if (err instanceof ApiError && err.status === 400 && /^alias/i.test(message)) {
        setErrors({ alias: message });
      } else if (err instanceof ApiError && err.status === 400 && /^expiresAt/i.test(message)) {
        setErrors({ expires: message });
      } else setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card url-form" onSubmit={handleSubmit} noValidate>
      <h2>Acortar una URL</h2>
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      {created && (
        <p className="form-success" role="status">
          Enlace creado: <a href={created} target="_blank" rel="noopener noreferrer">{created}</a>
        </p>
      )}
      <Field
        label="URL larga"
        type="text"
        inputMode="url"
        placeholder="https://ejemplo.com/una/ruta/muy/larga"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        error={errors.url}
      />
      <Field
        label="Alias (opcional)"
        placeholder="mi-enlace"
        autoComplete="off"
        value={alias}
        onChange={(e) => setAlias(e.target.value)}
        error={errors.alias}
      />
      <p className="hint">Si lo dejas vacío, se genera un código aleatorio.</p>
      <Field
        label="Caduca el (opcional)"
        type="datetime-local"
        value={expires}
        onChange={(e) => setExpires(e.target.value)}
        error={errors.expires}
      />
      <p className="hint">Pasada esa fecha (en tu hora local), el enlace dejará de redirigir.</p>
      <button type="submit" disabled={submitting}>
        {submitting ? "Creando…" : "Acortar"}
      </button>
    </form>
  );
}
