import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiFetch,
  clearAuth,
  getRefreshToken,
  getToken,
  setRefreshToken,
  setToken,
} from "./api";

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = [];
  onmessage: ((ev: MessageEvent) => void) | null = null;
  posted: unknown[] = [];
  constructor(public name: string) {
    MockBroadcastChannel.instances.push(this);
  }
  postMessage(msg: unknown) {
    this.posted.push(msg);
  }
  close() {}
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // Node 22 já expõe um BroadcastChannel global; o jsdom do vitest não o
  // implementa. Substituímos de forma determinística pelo mock.
  Object.defineProperty(globalThis, "BroadcastChannel", {
    value: MockBroadcastChannel,
    configurable: true,
    writable: true,
  });
  // Não reinicia `instances`: o canal da api.ts é um singleton no módulo e
  // sobrevive entre testes; cada teste verifica a última mensagem enviada.
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
  clearAuth();
});

describe("apiFetch / autenticação", () => {
  it("usa o token armazenado e retorna json", async () => {
    setToken("access-1");
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    const res = await apiFetch<{ ok: boolean }>("/api/projects");

    expect(res.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/projects");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer access-1");
  });

  it("em 401 renova o access token e refaz a requisição", async () => {
    setToken("access-velho");
    setRefreshToken("refresh-velho");
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: "expirado" }, 401)) // GET /api/projects
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "access-novo", refresh_token: "refresh-novo" })
      ) // POST /api/auth/refresh
      .mockResolvedValueOnce(jsonResponse({ ok: true })); // GET /api/projects (retry)

    const res = await apiFetch<{ ok: boolean }>("/api/projects");

    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const refreshCall = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(refreshCall[0]).toBe("/api/auth/refresh");
    expect(JSON.parse(refreshCall[1].body as string).refresh_token).toBe("refresh-velho");

    expect(getToken()).toBe("access-novo");
    expect(getRefreshToken()).toBe("refresh-novo");
  });

  it("quando o refresh falha, limpa a autenticação e dispara auth:logout", async () => {
    setToken("access-velho");
    setRefreshToken("refresh-velho");
    const logoutSpy = vi.fn();
    window.addEventListener("auth:logout", logoutSpy);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: "expirado" }, 401))
      .mockResolvedValueOnce(jsonResponse({ detail: "inválido" }, 401));

    await expect(apiFetch("/api/projects")).rejects.toThrow();

    expect(logoutSpy).toHaveBeenCalledTimes(1);
    expect(getToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    window.removeEventListener("auth:logout", logoutSpy);
  });

  it("refaz o refresh (uma vez) se outra aba já rotacionou o token", async () => {
    setToken("access-velho");
    setRefreshToken("refresh-velho");

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: "expirado" }, 401)) // GET /api/projects
      .mockImplementationOnce(async (url: string) => {
        // Durante o refresh com o token velho, outra aba grava um token novo.
        if (url === "/api/auth/refresh") {
          setRefreshToken("refresh-novo");
          return jsonResponse({ detail: "inválido" }, 401);
        }
        return jsonResponse({ ok: true });
      })
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "access-novo", refresh_token: "refresh-novo2" })
      ) // refresh retry com refresh-novo
      .mockResolvedValueOnce(jsonResponse({ ok: true })); // GET /api/projects (retry)

    const res = await apiFetch<{ ok: boolean }>("/api/projects");

    expect(res.ok).toBe(true);
    // GET(401) + refresh(401) + refresh(retry 200) + GET(retry 200)
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(getRefreshToken()).toBe("refresh-novo2");
  });

  it("propaga o novo refresh token para outras abas via BroadcastChannel", async () => {
    setToken("access-velho");
    setRefreshToken("refresh-velho");
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: "expirado" }, 401))
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "access-novo", refresh_token: "refresh-novo" })
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await apiFetch("/api/projects");

    // O canal é um singleton no módulo; usa a instância criada pela api.ts
    // (criada no primeiro refresh bem-sucedido) e verifica a última mensagem.
    const channel = MockBroadcastChannel.instances.find(
      (c) => c.name === "apontamentto:refresh"
    );
    expect(channel).toBeDefined();
    expect(channel!.posted.at(-1)).toMatchObject({
      type: "refresh",
      access_token: "access-novo",
      refresh_token: "refresh-novo",
    });
  });

  it("atualiza tokens ao receber mensagem de outra aba", async () => {
    setToken("access-a");
    setRefreshToken("refresh-a");
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: "expirado" }, 401))
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "access-a2", refresh_token: "refresh-a2" })
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    await apiFetch("/api/projects");

    // Outra aba rotaciona e transmite pelo mesmo canal singleton
    const channel = MockBroadcastChannel.instances.find(
      (c) => c.name === "apontamentto:refresh"
    );
    expect(channel).toBeDefined();
    channel!.onmessage?.({
      data: { type: "refresh", access_token: "access-b", refresh_token: "refresh-b" },
    } as MessageEvent);

    expect(getToken()).toBe("access-b");
    expect(getRefreshToken()).toBe("refresh-b");
  });

  it("não tenta refresh em /api/auth/login e /api/auth/refresh", async () => {
    setToken("access-velho");
    setRefreshToken("refresh-velho");
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "inválido" }, 401));

    await expect(apiFetch("/api/auth/login", { method: "POST", body: {} })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1); // sem chamada de refresh
  });
});