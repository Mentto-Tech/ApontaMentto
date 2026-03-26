// Base URL: empty for Docker/nginx proxy, or set VITE_API_URL for Vercel → Render
const BASE_URL = import.meta.env.VITE_API_URL ?? "";

const TOKEN_KEY = "apontamentto_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
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

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined && !isFormData) headers["Content-Type"] = "application/json";

  const method = (rest.method || "GET").toUpperCase();
  const cache = rest.cache ?? (method === "GET" ? "no-store" : undefined);

  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers,
    cache,
    body:
      body === undefined
        ? undefined
        : isFormData
          ? (body as FormData)
          : JSON.stringify(body),
  });

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
