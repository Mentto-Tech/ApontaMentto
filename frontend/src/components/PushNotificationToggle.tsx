import { Button } from "@/components/ui/button";
import { Bell, BellOff, Loader2, Send } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface PushNotificationToggleProps {
  showTestButton?: boolean;
  variant?: "default" | "outline" | "ghost" | "sidebar" | "mobile";
}

export function PushNotificationToggle({ showTestButton = false, variant = "sidebar" }: PushNotificationToggleProps) {
  const { isSupported, permission, isSubscribed, isLoading, subscribe, unsubscribe, sendTestNotification } =
    usePushNotifications();

  if (variant === "mobile") {
    if (!isSupported) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                disabled
                className="shrink-0 flex flex-col items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-lg text-muted-foreground opacity-50 cursor-not-allowed"
              >
                <BellOff className="h-6 w-6" />
                <span>Notificações</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Seu navegador não suporta Notificações PUSH.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    if (permission === "denied") {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                disabled
                className="shrink-0 flex flex-col items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-lg text-destructive opacity-75 cursor-not-allowed"
              >
                <BellOff className="h-6 w-6 text-destructive" />
                <span>Push Bloqueado</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">As notificações foram bloqueadas nas configurações do seu navegador.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <button
        onClick={() => (isSubscribed ? unsubscribe() : subscribe())}
        disabled={isLoading}
        className={`shrink-0 flex flex-col items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-lg transition-colors ${
          isSubscribed
            ? "text-primary hover:bg-accent/50"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
        }`}
        title={isSubscribed ? "Desativar Notificações Push" : "Ativar Notificações Push"}
      >
        {isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <Bell className={`h-6 w-6 ${isSubscribed ? "text-primary fill-primary/20" : ""}`} />
        )}
        <span>{isSubscribed ? "Push Ativo" : "Ativar Push"}</span>
      </button>
    );
  }

  if (!isSupported) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" disabled className="w-full justify-start text-xs text-muted-foreground opacity-50">
              <BellOff className="h-4 w-4 mr-2" />
              Notificações PUSH
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Seu navegador não suporta Notificações PUSH.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (permission === "denied") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" disabled className="w-full justify-start text-xs text-destructive opacity-75">
              <BellOff className="h-4 w-4 mr-2 text-destructive" />
              Push Bloqueado
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">As notificações foram bloqueadas nas configurações do seu navegador.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const isSidebar = variant === "sidebar";

  return (
    <div className="flex items-center gap-1 w-full">
      {isSubscribed ? (
        <Button
          variant={isSidebar ? "ghost" : "outline"}
          size="sm"
          onClick={() => unsubscribe()}
          disabled={isLoading}
          className={
            isSidebar
              ? "flex-1 justify-start text-xs text-primary font-medium hover:bg-sidebar-accent/50"
              : "flex-1 text-xs"
          }
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Bell className="h-4 w-4 mr-2 text-primary fill-primary/20" />
          )}
          Push Ativo
        </Button>
      ) : (
        <Button
          variant={isSidebar ? "ghost" : "default"}
          size="sm"
          onClick={() => subscribe()}
          disabled={isLoading}
          className={
            isSidebar
              ? "flex-1 justify-start text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              : "flex-1 text-xs"
          }
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Bell className="h-4 w-4 mr-2 text-muted-foreground" />
          )}
          Ativar Push
        </Button>
      )}

      {(showTestButton || isSubscribed) && isSubscribed && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => sendTestNotification()} className="h-8 w-8 shrink-0">
                <Send className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Enviar notificação de teste</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

export default PushNotificationToggle;
