import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useUpdateProfile } from "@/lib/queries";
import { toast } from "sonner";
import { User, LogOut } from "lucide-react";

const Profile = () => {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const updateProfile = useUpdateProfile();
  const [name, setName] = useState(user?.name || "");
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
    <div className="max-w-md mx-auto px-4 py-6 md:py-10">
      <h1 className="text-2xl font-bold mb-6">Perfil</h1>

      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-7 w-7 text-primary" />
          </div>
          <div>
            <div className="font-semibold">{user?.name}</div>
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
