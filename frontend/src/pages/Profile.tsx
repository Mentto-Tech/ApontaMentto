import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useUpdateProfile } from "@/lib/queries";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { User, LogOut, DollarSign, Zap, DownloadCloud, AlertTriangle, Key } from "lucide-react";
import "../styles/Profile.css";

const Profile = () => {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const updateProfile = useUpdateProfile();
  const [name, setName] = useState(user?.name ?? user?.username ?? "");
  const [email, setEmail] = useState(user?.email || "");
  const [exporting, setExporting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  
  const handleExportData = async () => {
    setExporting(true);
    try {
      const data = await apiFetch<any>("/api/users/me/data-export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `meus_dados_apontamentto.json`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      toast.success("Dados exportados com sucesso!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao exportar dados.");
    } finally {
      setExporting(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;
    setChangingPassword(true);
    try {
      await apiFetch("/api/users/me/change-password", {
        method: "POST",
        body: { currentPassword, newPassword }
      });
      toast.success("Senha alterada com sucesso!");
      setPasswordModalOpen(false);
      setCurrentPassword("");
      setNewPassword("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar senha.");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmName !== (user?.name || user?.username)) {
      toast.error("O nome digitado não confere.");
      return;
    }
    setDeleting(true);
    try {
      await apiFetch("/api/users/me", { method: "DELETE" });
      toast.success("Conta excluída com sucesso.");
      logout();
      navigate("/login");
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir conta.");
    } finally {
      setDeleting(false);
      setDeleteModalOpen(false);
    }
  };

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

      {/* Segurança */}
      <div className="profile-card bg-card border border-border rounded-lg p-6 mt-4 space-y-4">
        <h2 className="text-sm font-semibold mb-3">Segurança</h2>
        <Button variant="outline" className="w-full flex justify-between" onClick={() => setPasswordModalOpen(true)}>
          <span className="flex items-center"><Key className="h-4 w-4 mr-2" /> Alterar Senha</span>
        </Button>
      </div>

      {/* LGPD Actions */}
      <div className="profile-card bg-card border border-border rounded-lg p-6 mt-4 space-y-4">
        <h2 className="text-sm font-semibold mb-3">Privacidade e Dados (LGPD)</h2>
        <Button variant="outline" className="w-full flex justify-between" onClick={handleExportData} disabled={exporting}>
          <span className="flex items-center"><DownloadCloud className="h-4 w-4 mr-2" /> Exportar Meus Dados</span>
          {exporting && <span className="text-xs">Aguarde...</span>}
        </Button>
        <Button variant="outline" className="w-full text-destructive border-transparent hover:bg-destructive/10 hover:text-black flex justify-between" onClick={() => setDeleteModalOpen(true)}>
          <span className="flex items-center"><AlertTriangle className="h-4 w-4 mr-2" /> Excluir Minha Conta</span>
        </Button>
      </div>

      <Button
        variant="outline"
        onClick={handleLogout}
        className="w-full mt-4 text-destructive border-destructive/30 hover:bg-destructive hover:text-white"
      >
        <LogOut className="h-4 w-4 mr-2" />
        Sair da conta
      </Button>

      {/* Troca de Senha Modal */}
      <Dialog open={passwordModalOpen} onOpenChange={setPasswordModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Senha</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleChangePassword}>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium mb-1 block">Senha atual</label>
                <Input 
                  type="password"
                  value={currentPassword} 
                  onChange={e => setCurrentPassword(e.target.value)} 
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Nova senha</label>
                <Input 
                  type="password"
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)} 
                  required
                />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setPasswordModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={changingPassword}>
                {changingPassword ? "Salvando..." : "Alterar Senha"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Exclusão Modal */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Conta</DialogTitle>
            <DialogDescription>
              Atenção: sua conta será desativada e seus dados pessoais serão anonimizados para conformidade com a LGPD. 
              Ao prosseguir, você perderá acesso ao sistema.
              <br /><br />
              Para confirmar, digite seu nome exatamente como aparece no perfil: <strong>{user?.name || user?.username}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input 
              value={deleteConfirmName} 
              onChange={e => setDeleteConfirmName(e.target.value)} 
              placeholder="Digite seu nome para confirmar" 
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)} disabled={deleting}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteAccount} disabled={deleting || deleteConfirmName !== (user?.name || user?.username)}>
              {deleting ? "Excluindo..." : "Confirmar Exclusão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Profile;
