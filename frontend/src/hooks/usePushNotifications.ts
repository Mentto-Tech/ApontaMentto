import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(true);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);

  const checkSubscription = useCallback(async () => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setIsSupported(false);
      setIsChecking(false);
      return;
    }

    setIsSupported(true);
    try {
      setPermission(Notification.permission);
    } catch {
      // Ignore if permission getter throws
    }

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("ServiceWorker operation timeout")), 2500)
      );

      const getRegPromise = async () => {
        let reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
          reg = await navigator.serviceWorker.register("/sw.js");
        }
        return reg;
      };

      const reg = (await Promise.race([getRegPromise(), timeoutPromise])) as ServiceWorkerRegistration | undefined;
      if (reg) {
        const subPromise = reg.pushManager.getSubscription();
        const sub = (await Promise.race([subPromise, timeoutPromise])) as PushSubscription | null;
        setIsSubscribed(!!sub);

        if (Notification.permission === "granted" && !sub) {
          apiFetch<{ publicKey: string }>("/api/push/vapid-public-key")
            .then(async ({ publicKey }) => {
              if (publicKey) {
                const convertedKey = urlBase64ToUint8Array(publicKey);
                const newSub = await reg.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: convertedKey as unknown as BufferSource,
                });
                const subJson = newSub.toJSON();
                await apiFetch("/api/push/subscribe", {
                  method: "POST",
                  body: {
                    endpoint: newSub.endpoint,
                    keys: {
                      p256dh: subJson.keys?.p256dh || "",
                      auth: subJson.keys?.auth || "",
                    },
                  },
                });
                setIsSubscribed(true);
              }
            })
            .catch((err) => console.warn("Background push resubscribe skipped:", err));
        }
      }
    } catch (err) {
      console.warn("Check push subscription warning:", err);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  const subscribe = async () => {
    if (!isSupported) {
      toast.error("Notificações PUSH não são suportadas neste navegador.");
      return false;
    }

    setIsActionLoading(true);
    try {
      const permResult = await Notification.requestPermission();
      setPermission(permResult);

      if (permResult !== "granted") {
        toast.error("Permissão de notificação negada pelo usuário.");
        return false;
      }

      // 1. Obter chave VAPID pública do servidor
      const { publicKey } = await apiFetch<{ publicKey: string }>("/api/push/vapid-public-key");
      if (!publicKey) {
        throw new Error("Chave VAPID pública não disponível.");
      }

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout ao acessar Service Worker.")), 5000)
      );

      const regPromise = (async () => {
        let reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
          reg = await navigator.serviceWorker.register("/sw.js");
        }
        await navigator.serviceWorker.ready;
        return reg;
      })();

      const reg = (await Promise.race([regPromise, timeoutPromise])) as ServiceWorkerRegistration;

      // 3. Inscrever no PushManager do navegador
      const convertedKey = urlBase64ToUint8Array(publicKey);
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey as unknown as BufferSource,
        });
      }

      const subJson = sub.toJSON();

      // 4. Enviar a inscrição para a API backend
      await apiFetch("/api/push/subscribe", {
        method: "POST",
        body: {
          endpoint: sub.endpoint,
          keys: {
            p256dh: subJson.keys?.p256dh || "",
            auth: subJson.keys?.auth || "",
          },
        },
      });

      setIsSubscribed(true);
      toast.success("Notificações PUSH ativadas com sucesso!");
      return true;
    } catch (err: any) {
      console.error("Erro ao inscrever para notificações push:", err);
      toast.error(err.message || "Erro ao ativar notificações PUSH.");
      return false;
    } finally {
      setIsActionLoading(false);
    }
  };

  const unsubscribe = async () => {
    if (!isSupported) return false;

    setIsActionLoading(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const endpoint = sub.endpoint;
          await sub.unsubscribe();

          await apiFetch("/api/push/unsubscribe", {
            method: "POST",
            body: { endpoint },
          });
        }
      }

      setIsSubscribed(false);
      toast.success("Notificações PUSH desativadas.");
      return true;
    } catch (err: any) {
      console.error("Erro ao desativar notificações push:", err);
      toast.error("Erro ao desativar notificações PUSH.");
      return false;
    } finally {
      setIsActionLoading(false);
    }
  };

  const sendTestNotification = async () => {
    try {
      await apiFetch("/api/push/test", { method: "POST" });
      toast.success("Notificação de teste enviada!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar notificação de teste.");
    }
  };

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading: isActionLoading,
    isChecking,
    subscribe,
    unsubscribe,
    sendTestNotification,
  };
}
