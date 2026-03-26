import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useUpdateProfile } from "@/lib/queries";
import { toast } from "sonner";
import { User, LogOut, DollarSign, Zap } from "lucide-react";
import "../styles/Profile.css";

const Profile = () => {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const updateProfile = useUpdateProfile();
  const [name, setName] = useState(user?.name ?? user?.username ?? "");
  const [email, setEmail] = useState(user?.email || "");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    updateProfile.mutate(
      { name: name.trim(), email: email.trim() },
      {
        onSuccess: () => {
          refreshUser();
          toast.success("Perfil atualizado!");
        },
        onError: (err: Error) => toast.error(err.message),
      }
    );
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="page-profile max-w-md mx-auto px-4 py-6 md:py-10">
      <h1 className="text-2xl font-bold mb-6">Perfil</h1>

      <div className="profile-card bg-card border border-border rounded-lg p-6">
        <div className="profile-header flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-7 w-7 text-primary" />
          </div>
          <div>
            <div className="font-semibold">{user?.name ?? user?.username}</div>
            <div className="text-xs text-muted-foreground capitalize px-2 py-0.5 rounded-full bg-muted inline-block mt-1">
              {user?.role}
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Nome</label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Email</label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <Button type="submit" className="w-full bg-primary" disabled={updateProfile.isPending}>
            {updateProfile.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </div>

      {/* Rates section (read-only) */}
      {(user?.hourlyRate != null || user?.overtimeHourlyRate != null) && (
        <div className="profile-card bg-card border border-border rounded-lg p-6 mt-4">
          <h2 className="text-sm font-semibold mb-3">Taxas</h2>
          <div className="profile-rates flex flex-wrap gap-4">
            {user?.hourlyRate != null && (
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Valor/hora normal</div>
                  <div className="font-semibold text-sm">R$ {user.hourlyRate.toFixed(2)}</div>
                </div>
              </div>
            )}
            {user?.overtimeHourlyRate != null && (
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                <div>
                  <div className="text-xs text-muted-foreground">Valor/hora extra</div>
                  <div className="font-semibold text-sm">R$ {user.overtimeHourlyRate.toFixed(2)}</div>
                </div>
              </div>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Os valores são configurados pelo administrador.
          </p>
        </div>
      )}

      <Button
        variant="outline"
        onClick={handleLogout}
        className="w-full mt-4 text-destructive border-destructive/30 hover:bg-destructive hover:text-white"
      >
        <LogOut className="h-4 w-4 mr-2" />
        Sair da conta
      </Button>
    </div>
  );
};

export default Profile;
