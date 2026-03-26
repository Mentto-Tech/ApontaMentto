import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, DollarSign, Briefcase, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUsers, useUpdateUserAdmin, type AuthUser } from "@/lib/queries";
import "../styles/AdminUsers.css";

const CATEGORY_LABELS: Record<string, string> = {
  clt: "CLT",
  pj: "PJ",
  estagiario: "Estagiário",
  dono: "Dono",
};

const CATEGORIES_WITH_HOURS = ["clt", "estagiario"];

const AdminUsers = () => {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const { data: allUsers = [] } = useUsers();
  const { mutate: updateUser, isPending } = useUpdateUserAdmin();

  const [localUsers, setLocalUsers] = useState<AuthUser[]>([]);

  useEffect(() => {
    if (allUsers.length > 0) {
      setLocalUsers(JSON.parse(JSON.stringify(allUsers)));
    }
  }, [allUsers]);

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center text-muted-foreground">
        Acesso restrito a administradores.
      </div>
    );
  }

  const handleFieldChange = (
    userId: string,
    field: keyof AuthUser,
    value: string | number | null
  ) => {
    setLocalUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, [field]: value } : u))
    );
  };

  const handleSave = (user: AuthUser) => {
    const originalUser = allUsers.find((u) => u.id === user.id);
    if (!originalUser) return;

    const changes: Partial<AuthUser> = {};
    if (user.hourlyRate !== originalUser.hourlyRate) {
      changes.hourlyRate = user.hourlyRate === null ? null : Number(user.hourlyRate);
    }
    if (user.overtimeHourlyRate !== originalUser.overtimeHourlyRate) {
      changes.overtimeHourlyRate = user.overtimeHourlyRate === null ? null : Number(user.overtimeHourlyRate);
    }
    if (user.category !== originalUser.category) {
      changes.category = user.category;
    }
    if (user.weeklyHours !== originalUser.weeklyHours) {
      changes.weeklyHours = user.weeklyHours === null ? null : Number(user.weeklyHours);
    }
    
    if (Object.keys(changes).length > 0) {
        updateUser({ userId: user.id, ...changes }, {
            onSuccess: () => toast({ title: "Sucesso!", description: `Dados de ${user.username} atualizados.`}),
            onError: () => toast({ variant: "destructive", title: "Erro!", description: "Não foi possível atualizar o usuário."})
        });
    }
  };

  return (
    <div className="page-admin-users max-w-2xl mx-auto px-4 py-6 md:py-10">
      <h1 className="admin-users-header text-2xl font-bold mb-6 flex items-center gap-2">
        <Users className="h-6 w-6 text-primary" />
        Gerenciar Usuários
      </h1>

      <div className="space-y-3">
        {localUsers.map((user) => (
          <div key={user.id} className="admin-user-card bg-card border border-border rounded-lg p-4">
            <div className="font-semibold text-sm">{user.username}</div>
            <div className="text-xs text-muted-foreground mb-3">{user.email}</div>

            <div className="admin-users-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {/* Category */}
              <div className="admin-user-field flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <div>
                  <label className="text-[10px] text-muted-foreground block">Categoria</label>
                  <Select
                    value={user.category || "clt"}
                    onValueChange={(val) => handleFieldChange(user.id, "category", val)}
                  >
                    <SelectTrigger className="admin-user-input w-32 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Weekly Hours */}
              {CATEGORIES_WITH_HOURS.includes(user.category || "clt") && (
                <div className="admin-user-field flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <label className="text-[10px] text-muted-foreground block">Horas/semana</label>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      placeholder="40"
                      value={user.weeklyHours || ""}
                      onChange={(e) => handleFieldChange(user.id, "weeklyHours", e.target.value)}
                      className="admin-user-input w-24 h-8 text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Hourly Rate */}
              <div className="admin-user-field flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <div>
                  <label className="text-[10px] text-muted-foreground block">Valor/hora</label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="N/A"
                    value={user.hourlyRate || ""}
                    onChange={(e) => handleFieldChange(user.id, "hourlyRate", e.target.value)}
                    className="admin-user-input w-24 h-8 text-sm"
                  />
                </div>
              </div>

              {/* Overtime Hourly Rate */}
              <div className="admin-user-field flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <div>
                  <label className="text-[10px] text-muted-foreground block">Valor/hora extra</label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="N/A"
                    value={user.overtimeHourlyRate || ""}
                    onChange={(e) => handleFieldChange(user.id, "overtimeHourlyRate", e.target.value)}
                    className="admin-user-input w-24 h-8 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="mt-4">
                <Button size="sm" onClick={() => handleSave(user)} disabled={isPending}>
                    Salvar Alterações
                </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminUsers;
