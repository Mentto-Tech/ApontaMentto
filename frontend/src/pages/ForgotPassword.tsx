import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clock, ArrowLeft, MailCheck } from "lucide-react";
import { toast } from "sonner";
import "../styles/Login.css";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Erro ao enviar email.");
      }
      setSent(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  };

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
          <p className="text-sm text-muted-foreground mt-1">Recuperação de senha</p>
        </div>

        {sent ? (
          /* ---- Estado: email enviado ---- */
          <div className="auth-card bg-card border border-border rounded-xl p-6 flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center">
              <MailCheck className="h-7 w-7 text-green-500" />
            </div>
            <div>
              <p className="font-semibold text-base">Verifique seu email</p>
              <p className="text-sm text-muted-foreground mt-1">
                Se <strong>{email}</strong> estiver cadastrado, você receberá as
                instruções para redefinir sua senha em breve.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Não recebeu? Verifique a pasta de spam ou tente novamente.
            </p>
            <Button
              variant="outline"
              className="w-full mt-2"
              onClick={() => setSent(false)}
            >
              Tentar outro email
            </Button>
          </div>
        ) : (
          /* ---- Formulário ---- */
          <form
            onSubmit={handleSubmit}
            className="auth-card space-y-4 bg-card border border-border rounded-xl p-6"
          >
            <p className="text-sm text-muted-foreground">
              Informe seu email e enviaremos as instruções para redefinir sua senha.
            </p>
            <div>
              <label className="text-sm font-medium mb-1 block">Email</label>
              <Input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoFocus
              />
            </div>
            <Button
              id="forgot-submit"
              type="submit"
              className="w-full bg-primary"
              disabled={loading}
            >
              {loading ? "Enviando..." : "Enviar instruções"}
            </Button>
          </form>
        )}

        {/* Voltar ao login */}
        <div className="mt-4 text-center">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar ao login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
