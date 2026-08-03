import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clock, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import "../styles/Login.css";

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const trimmedEmail = email.trim();
    if (trimmedEmail !== email) {
      console.warn("[Login] Email enviado com espaços extras removidos automaticamente");
    }

    const ok = await login(trimmedEmail, password);
    setLoading(false);

    if (ok) {
      navigate("/");
    } else {
      toast.error("Email ou senha incorretos.");
    }
  };

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
          <p className="text-sm text-muted-foreground mt-1">Entre para continuar</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-card space-y-4 bg-card border border-border rounded-xl p-6">
          <div>
            <label className="text-sm font-medium mb-1 block">Email</label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" required />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Senha</label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••"
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full bg-primary" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-4">
          Não tem conta?{" "}
          <Link to="/signup" className="text-primary font-medium hover:underline">Cadastre-se</Link>
        </p>

        <p className="text-center text-sm mt-2">
          <Link to="/forgot-password" className="text-primary font-medium hover:underline">Esqueci minha senha</Link>
        </p>

        <div className="mt-8 text-center text-xs text-muted-foreground">
          <p>
            Ao entrar, você concorda com nossos{" "}
            <a href="https://mentto.com.br/termos-de-uso-e-politicas-de-privacidade" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              Termos de Uso e Política de Privacidade
            </a>.
          </p>
          <p className="mt-1">
            Seus dados de ponto são retidos por 5 anos (art. 11 CLT).
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
