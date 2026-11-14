import type { UrlItem } from "../api/types";
import { CopyButton } from "./CopyButton";

const dateFormat = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" });
const formatDate = (iso: string): string => dateFormat.format(new Date(iso));

function expirationLabel(u: UrlItem): string {
  if (!u.expiresAt) return "Nunca";
  return u.expired ? `Expiró el ${formatDate(u.expiresAt)}` : formatDate(u.expiresAt);
}

export function UrlList({ urls }: { urls: UrlItem[] }) {
  if (urls.length === 0) {
    return (
      <p className="empty">
        Todavía no has creado ningún enlace. Usa el formulario para acortar el primero.
      </p>
    );
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Enlace corto</th>
            <th scope="col">Destino</th>
            <th scope="col" className="num">Clicks</th>
            <th scope="col">Último click</th>
            <th scope="col">Caduca</th>
            <th scope="col">Creado</th>
          </tr>
        </thead>
        <tbody>
          {urls.map((u) => (
            <tr key={u.id} className={u.expired ? "expired" : undefined}>
              <td className="short">
                <a href={u.shortUrl} target="_blank" rel="noopener noreferrer">
                  /{u.code}
                </a>
                {u.expired ? (
                  <>
                    <span className="badge">Expirada</span>
                    <button type="button" className="secondary small" disabled title="El enlace ha expirado">
                      Copiar
                    </button>
                  </>
                ) : (
                  <CopyButton text={u.shortUrl} />
                )}
              </td>
              <td className="long" title={u.longUrl}>
                {u.longUrl}
              </td>
              <td className="num">{u.clicks}</td>
              <td>{u.lastClickAt ? formatDate(u.lastClickAt) : "—"}</td>
              <td>{expirationLabel(u)}</td>
              <td>{formatDate(u.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
