import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import "../styles/Signup.css";

const Signup = () => {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    setLoading(true);
    const ok = await signup(name, email, password);
    setLoading(false);
    if (ok) {
      toast.success("Conta criada com sucesso!");
      navigate("/");
    } else {
      toast.error("Este email já está cadastrado.");
    }
  };

  return (
    <div className="page-signup min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Clock className="h-8 w-8 text-primary" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold">
            Aponta<span className="text-primary">Mentto</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Crie sua conta</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-card space-y-4 bg-card border border-border rounded-xl p-6">
          <div>
            <label className="text-sm font-medium mb-1 block">Nome</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome" required />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Email</label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" required />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Senha</label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" required />
          </div>
          <Button type="submit" className="w-full bg-primary" disabled={loading}>
            {loading ? "Criando conta..." : "Criar Conta"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-4">
          Já tem conta?{" "}
          <Link to="/login" className="text-primary font-medium hover:underline">Entrar</Link>
        </p>
      </div>
    </div>
  );
};

export default Signup;
