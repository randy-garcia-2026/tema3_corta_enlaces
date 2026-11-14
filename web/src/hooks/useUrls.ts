import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client";
import type { UrlItem } from "../api/types";
import { listUrls } from "../api/urls";
import { useAuth } from "../auth/AuthContext";

export type UrlsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; urls: UrlItem[] };

export function useUrls(): { state: UrlsState; reload: () => void } {
  const { token } = useAuth();
  const [state, setState] = useState<UrlsState>({ status: "loading" });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listUrls(token).then(
      (urls) => {
        if (!cancelled) setState({ status: "ready", urls });
      },
      (err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : "No se pudieron cargar tus enlaces";
        setState({ status: "error", message });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { state, reload };
}
