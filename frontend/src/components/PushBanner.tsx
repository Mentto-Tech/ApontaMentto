import { useState, useEffect } from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Button } from "@/components/ui/button";
import { Bell, X } from "lucide-react";

export function PushBanner() {
  const { isSupported, permission, isSubscribed, subscribe } = usePushNotifications();
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    const isDismissed = localStorage.getItem("push_banner_dismissed");
    if (isDismissed === "true") {
      setDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("push_banner_dismissed", "true");
  };

  const handleEnable = async () => {
    const success = await subscribe();
    if (success) {
      setDismissed(true);
    }
  };

  // Se não suportar, permissão negada, já inscrito ou dispensou o banner, não mostra
  if (!isSupported || permission !== "default" || isSubscribed || dismissed) {
    return null;
  }

  return (
    <div className="bg-primary/10 border-b border-primary/20 px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2 text-foreground">
        <Bell className="h-4 w-4 text-primary shrink-0 animate-bounce" />
        <span>Receba notificações PUSH instantâneas sobre novos avisos no seu celular ou computador!</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" onClick={handleEnable} className="text-xs h-8">
          Ativar Notificações
        </Button>
        <button
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
          title="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default PushBanner;
