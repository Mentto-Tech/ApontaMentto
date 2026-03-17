import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export function useApiWakeUp() {
  const [isAwake, setIsAwake] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Se não tiver API_URL configurada (Docker local), considera já acordado
    if (!API_URL) {
      setIsAwake(true);
      return;
    }

    let cancelled = false;

    const ping = async () => {
      try {
        const res = await fetch(`${API_URL}/api/health`, { signal: AbortSignal.timeout(8000) });
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
      const interval = setInterval(async () => {
        setAttempt(a => a + 1);
        const ok = await ping();
        if (ok) clearInterval(interval);
      }, 3000);

      return () => clearInterval(interval);
    };

    run();
    return () => { cancelled = true; };
  }, []);

  return { isAwake, attempt };
}
