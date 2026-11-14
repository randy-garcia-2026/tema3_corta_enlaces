import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Sin permiso de portapapeles (p. ej. HTTP): el usuario aún puede seleccionar el enlace.
    }
  }

  return (
    <button type="button" className="secondary small" onClick={copy}>
      {copied ? "¡Copiado!" : "Copiar"}
    </button>
  );
}
