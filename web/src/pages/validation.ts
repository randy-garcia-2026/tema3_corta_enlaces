// Mismas reglas que valida el servidor (auth.routes.ts), para avisar antes de enviar.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return "Escribe tu email";
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return "El email no es válido";
  return undefined;
}

export function validatePassword(value: string): string | undefined {
  if (value.length < 8) return "La contraseña debe tener al menos 8 caracteres";
  if (new TextEncoder().encode(value).length > 72) {
    return "La contraseña no puede superar 72 bytes";
  }
  return undefined;
}

export function validateName(value: string): string | undefined {
  const name = value.trim();
  if (!name) return "Escribe tu nombre";
  if (name.length > 100) return "El nombre no puede superar 100 caracteres";
  return undefined;
}
