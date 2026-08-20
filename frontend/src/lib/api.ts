const BASE_URL = import.meta.env.VITE_API_URL ?? "";

const TOKEN_KEY = "apontamentto_token";
const REFRESH_TOKEN_KEY = "apontamentto_refresh_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export function removeRefreshToken(): void {
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function clearAuth(): void {
  removeToken();
  removeRefreshToken();
}

// Máscara de token para logs — nunca expõe o token completo
function maskToken(token: string | null): string {
  if (!token) return "<vazio>";
  if (token.length <= 8) return `<${token.length} caracteres>`;
  return `${token.slice(0, 4)}...${token.slice(-4)} (len=${token.length})`;
}

// Sincroniza a rotação do refresh token entre abas do mesmo navegador
const REFRESH_CHANNEL = "apontamentto:refresh";
let _channel: BroadcastChannel | null = null;

function getRefreshChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!_channel) {
    try {
      _channel = new BroadcastChannel(REFRESH_CHANNEL);
      _channel.onmessage = (event: MessageEvent) => {
        const msg = event.data as
          | { type?: string; access_token?: string; refresh_token?: string }
          | null;
        if (!msg || msg.type !== "refresh") return;
        if (msg.access_token) setToken(msg.access_token);
        if (msg.refresh_token) setRefreshToken(msg.refresh_token);
        console.info(
          "[api] Refresh sincronizado de outra aba | token=",
          maskToken(msg.refresh_token ?? null)
        );
      };
    } catch {
      _channel = null;
    }
  }
  return _channel;
}

function broadcastRefresh(accessToken: string, refreshToken: string): void {
  const ch = getRefreshChannel();
  if (!ch) return;
  try {
    ch.postMessage({
      type: "refresh",
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  } catch {
    // canal indisponível — outras abas serão sincronizadas via backend na próxima rotação
  }
}

// Controle para evitar múltiplas chamadas de refresh simultâneas
let _refreshPromise: Promise<string | null> | null = null;

async function tryRefreshToken(): Promise<string | null> {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    const initialToken = getRefreshToken();
    if (!initialToken) return null;

    let retries = 0;
    const MAX_RETRIES = 2;

    const attempt = async (): Promise<string | null> => {
      const tokenToUse = getRefreshToken();
      if (!tokenToUse) return null;

      console.info("[api] Tentando renovar access token | token=", maskToken(tokenToUse));

      try {
        const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: tokenToUse }),
        });

        if (!res.ok) {
          console.warn(
            `[api] Refresh rejeitado (status=${res.status}) | token usado=${maskToken(tokenToUse)}`
          );
          // Outra aba pode ter rotacionado o token enquanto esta requisição estava em voo.
          // Se o token atual em localStorage mudou, tenta uma única vez com o novo.
          const currentToken = getRefreshToken();
          if (currentToken && currentToken !== tokenToUse && retries < MAX_RETRIES) {
            retries += 1;
            console.info(
              "[api] Retry de refresh com token atualizado por outra aba | token=",
              maskToken(currentToken)
            );
            return attempt();
          }
          clearAuth();
          return null;
        }

        const data = await res.json();
        setToken(data.access_token);
        setRefreshToken(data.refresh_token);
        broadcastRefresh(data.access_token, data.refresh_token);
        console.info("[api] Access token renovado | token=", maskToken(data.refresh_token));
        return data.access_token as string;
      } catch (err) {
        console.warn("[api] Erro ao renovar access token:", err);
        clearAuth();
        return null;
      }
    };

    return attempt();
  })();

  _refreshPromise.finally(() => {
    _refreshPromise = null;
  });

  return _refreshPromise;
}

// ---------------------------------------------------------------------------
// Generic fetch wrapper — uses `body` as an arbitrary object (auto-serialised)
// ---------------------------------------------------------------------------
export type ApiFetchOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const token = getToken();

  const { body, ...rest } = options;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  const buildHeaders = (t: string | null): Record<string, string> => {
    const h: Record<string, string> = { ...(options.headers as Record<string, string>) };
    if (t) h["Authorization"] = `Bearer ${t}`;
    if (body !== undefined && !isFormData) h["Content-Type"] = "application/json";
    return h;
  };

  const method = (rest.method || "GET").toUpperCase();
  const cache = rest.cache ?? (method === "GET" ? "no-store" : undefined);
  const serializedBody =
    body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body);

  const doFetch = (t: string | null) =>
    fetch(`${BASE_URL}${path}`, {
      ...rest,
      headers: buildHeaders(t),
      cache,
      body: serializedBody,
    });

  let res = await doFetch(token);

  // Se 401, tenta renovar o access token uma vez
  if (res.status === 401 && path !== "/api/auth/refresh" && path !== "/api/auth/login") {
    console.warn(`[api] 401 em ${path} — tentando renovar sessão`);
    const newToken = await tryRefreshToken();
    if (newToken) {
      res = await doFetch(newToken);
    } else {
      // Refresh falhou — dispara evento para o AuthContext reagir
      console.warn(`[api] Renovação falhou para ${path} — encerrando sessão`);
      window.dispatchEvent(new Event("auth:logout"));
    }
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const json = await res.json();
      detail = json.detail || detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

export async function apiFetchBlob(
  path: string,
  options: Omit<RequestInit, "body"> & { body?: FormData } = {}
): Promise<Blob> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`,
    {
      ...options,
      headers,
      body: options.body,
    }
  );

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const json = await res.json();
      detail = json.detail || detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  return res.blob();
}

export const fetchSignedPdfs = async (userId: string): Promise<any[]> => {
    const params = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
    const response = await apiFetch<any[]>(`/api/signed-pdfs${params}`);
    return response;
};

export const downloadSignedPdf = async (pdfId: string): Promise<void> => {
    const blob = await apiFetchBlob(`/api/signed-pdfs/${pdfId}`);

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `signed_timesheet_${pdfId}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.parentNode.removeChild(link);
};
