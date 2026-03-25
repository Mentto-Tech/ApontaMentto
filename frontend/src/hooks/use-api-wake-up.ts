import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export function useApiWakeUp() {
  const [isAwake, setIsAwake] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [isOffline, setIsOffline] = useState(false);

  const forceAwake = () => setIsAwake(true);

  useEffect(() => {
    const updateOnline = () => setIsOffline(typeof navigator !== "undefined" ? !navigator.onLine : false);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);

    // Se não tiver API_URL configurada (Docker local), considera já acordado
    if (!API_URL) {
      setIsAwake(true);
      return () => {
        window.removeEventListener("online", updateOnline);
        window.removeEventListener("offline", updateOnline);
      };
    }

    // Se estiver offline, não bloqueia a UI com o wake-up
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return () => {
        window.removeEventListener("online", updateOnline);
        window.removeEventListener("offline", updateOnline);
      };
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
    return () => {
      cancelled = true;
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  return { isAwake, attempt, isOffline, forceAwake };
}
