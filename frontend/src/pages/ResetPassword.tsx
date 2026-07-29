import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clock, Eye, EyeOff, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import "../styles/Login.css";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const isTokenMissing = !token;

  // Validações em tempo real
  const hasMinLength = newPassword.length >= 8;
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!hasMinLength) {
      toast.error("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (!passwordsMatch) {
      toast.error("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail ?? "Erro ao redefinir senha.");
      }
      setSuccess(true);
      toast.success("Senha redefinida com sucesso!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  };

  // ---- Token ausente na URL ----
  if (isTokenMissing) {
    return (
      <div className="page-login min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Clock className="h-8 w-8 text-primary" strokeWidth={2.5} />
            </div>
            <h1 className="text-2xl font-bold">
              Aponta<span className="text-primary">Mentto</span>
            </h1>
          </div>
          <div className="auth-card bg-card border border-border rounded-xl p-6 flex flex-col items-center text-center gap-4">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <div>
              <p className="font-semibold">Link inválido</p>
              <p className="text-sm text-muted-foreground mt-1">
                O link de redefinição de senha está incompleto ou inválido.
                Solicite um novo link.
              </p>
            </div>
            <Link to="/forgot-password">
              <Button className="w-full bg-primary">Solicitar novo link</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ---- Sucesso ----
  if (success) {
    return (
      <div className="page-login min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Clock className="h-8 w-8 text-primary" strokeWidth={2.5} />
            </div>
            <h1 className="text-2xl font-bold">
              Aponta<span className="text-primary">Mentto</span>
            </h1>
          </div>
          <div className="auth-card bg-card border border-border rounded-xl p-6 flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <div>
              <p className="font-semibold text-base">Senha redefinida!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Sua senha foi atualizada com sucesso. Faça login com a nova senha.
              </p>
            </div>
            <Button
              className="w-full bg-primary"
              onClick={() => navigate("/login")}
            >
              Ir para o login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Formulário ----
  return (
    <div className="page-login min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Clock className="h-8 w-8 text-primary" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold">
            Aponta<span className="text-primary">Mentto</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Defina sua nova senha</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="auth-card space-y-4 bg-card border border-border rounded-xl p-6"
        >
          {/* Nova senha */}
          <div>
            <label className="text-sm font-medium mb-1 block">Nova senha</label>
            <div className="relative">
              <Input
                id="reset-new-password"
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
                autoFocus
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {/* Indicador de força */}
            {newPassword.length > 0 && (
              <p
                className={`text-xs mt-1 flex items-center gap-1 ${
                  hasMinLength ? "text-green-500" : "text-muted-foreground"
                }`}
              >
                {hasMinLength ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <AlertCircle className="h-3 w-3" />
                )}
                {hasMinLength ? "Tamanho adequado" : "Mínimo de 8 caracteres"}
              </p>
            )}
          </div>

          {/* Confirmar senha */}
          <div>
            <label className="text-sm font-medium mb-1 block">Confirmar nova senha</label>
            <Input
              id="reset-confirm-password"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repita a nova senha"
              required
              className={
                confirmPassword.length > 0
                  ? passwordsMatch
                    ? "border-green-500 focus-visible:ring-green-500"
                    : "border-destructive focus-visible:ring-destructive"
                  : ""
              }
            />
            {confirmPassword.length > 0 && (
              <p
                className={`text-xs mt-1 flex items-center gap-1 ${
                  passwordsMatch ? "text-green-500" : "text-destructive"
                }`}
              >
                {passwordsMatch ? (
                  <><CheckCircle2 className="h-3 w-3" /> Senhas coincidem</>
                ) : (
                  <><AlertCircle className="h-3 w-3" /> As senhas não coincidem</>
                )}
              </p>
            )}
          </div>

          <Button
            id="reset-submit"
            type="submit"
            className="w-full bg-primary"
            disabled={loading || !hasMinLength || !passwordsMatch}
          >
            {loading ? "Salvando..." : "Redefinir senha"}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <Link
            to="/login"
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            Voltar ao login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
