import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Users, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { useUsers, useUpdateUserRate } from "@/lib/queries";

const AdminUsers = () => {
  const { isAdmin } = useAuth();
  const { data: allUsers = [] } = useUsers();
  const updateRate = useUpdateUserRate();

  const [rates, setRates] = useState<Record<string, string>>({});

  useEffect(() => {
    const initial: Record<string, string> = {};
    allUsers.forEach(u => {
      initial[u.id] = u.hourlyRate != null ? String(u.hourlyRate) : "";
    });
    setRates(initial);
  }, [allUsers]);

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center text-muted-foreground">
        Acesso restrito a administradores.
      </div>
    );
  }

  const handleSave = (userId: string) => {
    const val = rates[userId];
    const rate = val === "" ? null : parseFloat(val);
    if (val !== "" && (isNaN(rate!) || rate! < 0)) {
      toast.error("Valor inválido");
      return;
    }
    updateRate.mutate(
      { userId, hourlyRate: rate },
      { onSuccess: () => toast.success("Valor/hora atualizado!") }
    );
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-10">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Users className="h-6 w-6 text-primary" />
        Gerenciar Usuários
      </h1>

      <div className="space-y-3">
        {allUsers.map(u => (
          <div key={u.id} className="bg-card border border-border rounded-lg p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[150px]">
              <div className="font-semibold text-sm">{u.name}</div>
              <div className="text-xs text-muted-foreground">{u.email}</div>
              <span className="text-[10px] capitalize px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{u.role}</span>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <Input
                type="number"
                min={0}
                step={0.01}
                placeholder="Valor/hora"
                value={rates[u.id] || ""}
                onChange={e => setRates(r => ({ ...r, [u.id]: e.target.value }))}
                className="w-28"
              />
              <span className="text-xs text-muted-foreground">/h</span>
              <Button size="sm" onClick={() => handleSave(u.id)} disabled={updateRate.isPending}>
                Salvar
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminUsers;
