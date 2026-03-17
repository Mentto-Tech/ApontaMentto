import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export function useApiWakeUp() {
  const [isAwake, setIsAwake] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // If API_URL is empty we assume same-origin proxy/rewrite (Vercel rewrites, Vite proxy, nginx, etc.)
    const healthUrl = API_URL ? `${API_URL}/api/health` : "/api/health";

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const ping = async () => {
      try {
        const res = await fetch(healthUrl, { signal: AbortSignal.timeout(30_000) });
        if (res.ok && !cancelled) {
          setIsAwake(true);
          return true;
        }
      } catch {
        // ainda dormindo
      }
      return false;
    };

    const run = async () => {
      const ok = await ping();
      if (ok || cancelled) return;

      // Tenta a cada 3 segundos até acordar
      interval = setInterval(async () => {
        setAttempt((a) => a + 1);
        const ok = await ping();
        if (ok && interval) {
          clearInterval(interval);
          interval = null;
        }
      }, 3000);
    };

    run();
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, []);

  return { isAwake, attempt };
}
