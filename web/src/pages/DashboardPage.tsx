import { useAuth } from "../auth/AuthContext";
import { UrlForm } from "../components/UrlForm";
import { UrlList } from "../components/UrlList";
import { useUrls } from "../hooks/useUrls";

export function DashboardPage() {
  const { user, signOut } = useAuth();
  const { state, reload } = useUrls();

  const totalClicks =
    state.status === "ready" ? state.urls.reduce((sum, u) => sum + u.clicks, 0) : null;
  const expiredCount = state.status === "ready" ? state.urls.filter((u) => u.expired).length : 0;

  return (
    <div className="page">
      <header className="topbar">
        <h1>Snap</h1>
        <div className="user">
          <span>{user?.name}</span>
          <button type="button" className="secondary small" onClick={signOut}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <UrlForm onCreated={reload} />

      <section aria-labelledby="mis-enlaces">
        <div className="section-head">
          <h2 id="mis-enlaces">Mis enlaces</h2>
          {state.status === "ready" && (
            <p className="summary">
              {state.urls.length} {state.urls.length === 1 ? "enlace" : "enlaces"} · {totalClicks}{" "}
              {totalClicks === 1 ? "click" : "clicks"}
              {expiredCount > 0 && ` · ${expiredCount} ${expiredCount === 1 ? "expirada" : "expiradas"}`}
            </p>
          )}
        </div>

        {state.status === "loading" && <p className="empty">Cargando tus enlaces…</p>}
        {state.status === "error" && (
          <div className="form-error" role="alert">
            <p>{state.message}</p>
            <button type="button" className="secondary small" onClick={reload}>
              Reintentar
            </button>
          </div>
        )}
        {state.status === "ready" && <UrlList urls={state.urls} />}
      </section>
    </div>
  );
}
