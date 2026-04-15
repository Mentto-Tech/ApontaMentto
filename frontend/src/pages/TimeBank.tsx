import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Clock, Plus, Trash2, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatYmdToBr } from "@/lib/datetime";
import "@/styles/TimeBank.css";

interface TimeBankEntry {
  id: string;
  userId: string;
  dailyRecordId?: string;
  date: string;
  amountMinutes: number;
  description: string;
  entryType: string;
  createdAt: string;
}

interface TimeBankBalance {
  totalBalanceMinutes: number;
  entries: TimeBankEntry[];
}

interface User {
  id: string;
  username: string;
  email: string;
}

const TimeBank = () => {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string>(user?.id || "");
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Form state
  const [formDate, setFormDate] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formType, setFormType] = useState<"manual_add" | "manual_subtract">("manual_add");

  // Fetch users (admin only)
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: () => apiFetch<User[]>("/api/users"),
    enabled: isAdmin,
  });

  // Fetch time bank data
  const { data: timeBank, isLoading } = useQuery<TimeBankBalance>({
    queryKey: ["timeBank", selectedUserId, monthFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedUserId) params.append("userId", selectedUserId);
      if (monthFilter) params.append("month", monthFilter);
      return apiFetch<TimeBankBalance>(`/api/time-bank?${params.toString()}`);
    },
    enabled: !!selectedUserId,
  });

  // Create manual entry mutation
  const createEntryMutation = useMutation({
    mutationFn: (data: { date: string; amountMinutes: number; description?: string; entryType: string }) => {
      return apiFetch(`/api/time-bank?userId=${selectedUserId}`, {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timeBank"] });
      toast.success("Lançamento criado com sucesso");
      setIsDialogOpen(false);
      setFormDate("");
      setFormAmount("");
      setFormDescription("");
    },
    onError: () => {
      toast.error("Erro ao criar lançamento");
    },
  });

  // Delete entry mutation
  const deleteEntryMutation = useMutation({
    mutationFn: (entryId: string) => {
      return apiFetch(`/api/time-bank/${entryId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timeBank"] });
      toast.success("Lançamento removido");
    },
    onError: () => {
      toast.error("Erro ao remover lançamento");
    },
  });

  // Sync time bank from daily records
  const syncMutation = useMutation({
    mutationFn: () => {
      const params = new URLSearchParams();
      if (selectedUserId) params.append("userId", selectedUserId);
      return apiFetch<{ created: number; updated: number }>(`/api/time-bank/sync?${params.toString()}`, {
        method: "POST",
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["timeBank"] });
      toast.success(`Sincronizado: ${data.created} criados, ${data.updated} atualizados`);
    },
    onError: () => {
      toast.error("Erro ao sincronizar banco de horas");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountHours = parseFloat(formAmount);
    if (!formDate || isNaN(amountHours)) {
      toast.error("Preencha data e quantidade em horas");
      return;
    }
    const amountMinutes = Math.round(Math.abs(amountHours) * 60);
    createEntryMutation.mutate({
      date: formDate,
      amountMinutes: formType === "manual_subtract" ? -Math.abs(amountMinutes) : Math.abs(amountMinutes),
      description: formDescription || undefined,
      entryType: formType,
    });
  };

  const formatMinutes = (minutes: number) => {
    const isNegative = minutes < 0;
    const absMinutes = Math.abs(minutes);
    const hours = Math.floor(absMinutes / 60);
    const mins = absMinutes % 60;
    return `${isNegative ? "-" : ""}${hours}h${mins > 0 ? ` ${mins}m` : ""}`;
  };

  const balanceColor = useMemo(() => {
    if (!timeBank) return "text-muted-foreground";
    if (timeBank.totalBalanceMinutes > 0) return "text-green-600";
    if (timeBank.totalBalanceMinutes < 0) return "text-red-600";
    return "text-muted-foreground";
  }, [timeBank]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold">Banco de Horas</h1>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            Sincronizar
          </Button>
          {isAdmin && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Novo Lançamento
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Lançamento Manual</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={formType} onValueChange={(v: any) => setFormType(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual_add">Adicionar Horas</SelectItem>
                      <SelectItem value="manual_subtract">Subtrair Horas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Quantidade (horas)</Label>
                  <Input
                    type="number"
                    step="0.25"
                    min="0"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="Ex: 1.5 para 1h30"
                    required
                  />
                </div>
                <div>
                  <Label>Descrição (opcional)</Label>
                  <Textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Motivo do lançamento (opcional)"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={createEntryMutation.isPending}>
                    {createEntryMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          {isAdmin && (
            <div className="w-full sm:w-auto sm:min-w-[180px]">
              <Label className="text-xs mb-1">Usuário</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <Label className="text-xs mb-1">Mês (filtro)</Label>
            <Input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="w-full"
            />
          </div>
        </div>
      </Card>

      {/* Balance Card */}
      {timeBank && (
        <Card className="p-6 mb-6 bg-gradient-to-br from-primary/5 to-primary/10">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-background rounded-full">
              <Clock className="h-8 w-8 text-primary" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Saldo Total</div>
              <div className={`text-3xl font-bold ${balanceColor}`}>
                {formatMinutes(timeBank.totalBalanceMinutes)}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Entries List */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-4">Histórico de Lançamentos</h3>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : !timeBank || timeBank.entries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum lançamento encontrado
          </div>
        ) : (
          <div className="space-y-2">
            {timeBank.entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-gray"
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className={`p-2 rounded-full ${entry.amountMinutes > 0 ? "bg-green-100" : "bg-red-100"}`}>
                    {entry.amountMinutes > 0 ? (
                      <TrendingUp className="h-4 w-4 text-green-600" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{formatYmdToBr(entry.date)}</span>
                      <span className={`text-sm font-semibold ${entry.amountMinutes > 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatMinutes(entry.amountMinutes)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">{entry.description}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {entry.entryType === "auto" ? "Automático" : "Manual"}
                    </div>
                  </div>
                </div>
                {isAdmin && entry.entryType !== "auto" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hover-bg-gray"
                    onClick={() => {
                      if (confirm("Deseja remover este lançamento?")) {
                        deleteEntryMutation.mutate(entry.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default TimeBank;
