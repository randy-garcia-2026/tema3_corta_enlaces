import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../api/auth";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Field } from "../components/Field";
import { validateEmail } from "./validation";

export function LoginPage() {
  const { signIn, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string | undefined;
    password?: string | undefined;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errors = {
      email: validateEmail(email),
      password: password ? undefined : "Escribe tu contraseña",
    };
    setFieldErrors(errors);
    setFormError(null);
    if (errors.email || errors.password) return;

    setSubmitting(true);
    try {
      signIn(await login({ email: email.trim(), password }));
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Ocurrió un error inesperado");
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="card" onSubmit={handleSubmit} noValidate>
        <h1>Iniciar sesión</h1>
        {sessionExpired && (
          <p className="form-info" role="status">
            Tu sesión ha caducado. Inicia sesión de nuevo para continuar.
          </p>
        )}
        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
        />
        <Field
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Entrando…" : "Entrar"}
        </button>
        <p className="alt">
          ¿No tienes cuenta? <Link to="/register">Regístrate</Link>
        </p>
      </form>
    </main>
  );
}
