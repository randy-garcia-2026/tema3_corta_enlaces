import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../api/auth";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Field } from "../components/Field";
import { validateEmail, validateName, validatePassword } from "./validation";

interface FieldErrors {
  name?: string | undefined;
  email?: string | undefined;
  password?: string | undefined;
}

export function RegisterPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errors: FieldErrors = {
      name: validateName(name),
      email: validateEmail(email),
      password: validatePassword(password),
    };
    setFieldErrors(errors);
    setFormError(null);
    if (errors.name || errors.email || errors.password) return;

    setSubmitting(true);
    try {
      signIn(await register({ name: name.trim(), email: email.trim(), password }));
      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // El email duplicado es un problema del campo, no del formulario entero.
        setFieldErrors({ email: err.message });
      } else {
        setFormError(err instanceof ApiError ? err.message : "Ocurrió un error inesperado");
      }
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="card" onSubmit={handleSubmit} noValidate>
        <h1>Crear cuenta</h1>
        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
        <Field
          label="Nombre"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
        />
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        />
        <p className="hint">Mínimo 8 caracteres.</p>
        <button type="submit" disabled={submitting}>
          {submitting ? "Creando cuenta…" : "Registrarme"}
        </button>
        <p className="alt">
          ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
        </p>
      </form>
    </main>
  );
}
