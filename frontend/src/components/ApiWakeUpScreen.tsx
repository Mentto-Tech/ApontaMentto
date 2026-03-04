export default function ApiWakeUpScreen() {

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6 px-4">
      <img src="/logo.png" alt="ApontaMentto" className="h-16 w-auto opacity-90" />

      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
          <span className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
          <span className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce" />
        </div>
        <p className="text-sm font-medium text-foreground">Iniciando o servidor…</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          O servidor está iniciando. Isso pode levar até 1 minuto.
        </p>
      </div>
    </div>
  );
}
