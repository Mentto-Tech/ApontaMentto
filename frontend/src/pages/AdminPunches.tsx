import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useAdminPunches,
  useUpdateAdminPunch,
  useUsers,
  type AdminPunchRecord,
} from "@/lib/queries";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { CalendarClock, Save, PencilLine } from "lucide-react";
import { formatYmdToBr } from "@/lib/datetime";
import "../styles/AdminPunches.css";

const PUNCH_FIELDS = ["in1", "out1", "in2", "out2", "extraIn", "extraOut", "lunch"] as const;
type PunchField = (typeof PUNCH_FIELDS)[number];

const FIELD_LABELS: Record<string, string> = {
  in1: "Entrada 1",
  out1: "Saída 1",
  in2: "Entrada 2",
  out2: "Saída 2",
  extraIn: "HE Entrada",
  extraOut: "HE Saída",
  lunch: "Almoço",
};

const AdminPunches = () => {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const { data: users = [] } = useUsers();

  const [month, setMonth] = useState(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${d.getFullYear()}-${m}`;
  });
  const [date, setDate] = useState<string>("");
  const [userId, setUserId] = useState<string>("all");

  const effectiveParams = useMemo(() => {
    const trimmedDate = date.trim();
    const trimmedMonth = month.trim();
    return {
      month: trimmedDate ? undefined : trimmedMonth || undefined,
      date: trimmedDate || undefined,
      userId: userId === "all" ? undefined : userId,
    };
  }, [date, month, userId]);

  const { data: records = [], isLoading, isError, error } = useAdminPunches(effectiveParams);

  const { mutate: savePunch, isPending } = useUpdateAdminPunch();

  // Drafts de edição por registro (somente campos alterados localmente)
  const [drafts, setDrafts] = useState<Record<string, Partial<Record<PunchField, string>>>>({});

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center text-muted-foreground">
        Acesso restrito a administradores.
      </div>
    );
  }

  const handleChange = (recordId: string, field: PunchField, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [recordId]: { ...(prev[recordId] ?? {}), [field]: value },
    }));
  };

  const handleSave = (record: AdminPunchRecord) => {
    const draft = drafts[record.id] ?? {};
    const payload: Record<string, string | null> = {};

    for (const field of PUNCH_FIELDS) {
      const draftVal = (draft[field] ?? "") || null;
      const origVal = (record[field] ?? "") || null;
      if (draftVal !== origVal) {
        payload[field] = draftVal;
      }
    }

    if (Object.keys(payload).length === 0) {
      toast({ title: "Nenhuma alteração", description: "Os horários não foram alterados." });
      return;
    }

    savePunch(
      { recordId: record.id, ...payload },
      {
        onSuccess: (updated) => {
          setDrafts((prev) => {
            const next = { ...prev };
            delete next[record.id];
            return next;
          });
          toast({
            title: "Ponto atualizado!",
            description: `Horários de ${updated.username ?? "usuário"} em ${formatYmdToBr(updated.date)} salvos.`,
          });
        },
        onError: (err) => {
          toast({
            variant: "destructive",
            title: "Erro ao salvar",
            description: err instanceof Error ? err.message : "Não foi possível atualizar o ponto.",
          });
        },
      },
    );
  };

  const hasDraftChanges = (record: AdminPunchRecord) => {
    const draft = drafts[record.id] ?? {};
    for (const field of PUNCH_FIELDS) {
      const draftVal = (draft[field] ?? "") || null;
      const origVal = (record[field] ?? "") || null;
      if (draftVal !== origVal) return true;
    }
    return false;
  };

  return (
    <div className="page-admin-punches max-w-6xl mx-auto px-4 py-5 sm:py-6 md:py-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 mb-5">
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <CalendarClock className="h-6 w-6 text-primary" />
          Pontos dos Usuários
        </h1>
      </div>

      <div className="bg-card border border-border rounded-lg p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block">Mês</label>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-10"
              disabled={Boolean(date.trim())}
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground block">Data</label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-10"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground block">Usuário</label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => {
                setDate("");
                setUserId("all");
                setDrafts({});
              }}
            >
              Limpar filtros
            </Button>
          </div>
        </div>

        <div className="mt-3 text-xs text-muted-foreground">
          {isLoading ? "Carregando…" : `${records.length} registro(s)`} · Dicas: clique nos campos de
          horário para editar e depois em "Salvar". Registros marcados como{" "}
          <span className="text-amber-600 font-medium">Alterado manualmente</span> foram editados por
          um administrador.
        </div>
      </div>

      {isError && (
        <div className="text-sm text-destructive text-center py-3">
          Erro ao carregar pontos: {error instanceof Error ? error.message : "desconhecido"}
        </div>
      )}

      {records.length === 0 && !isLoading && (
        <div className="text-sm text-muted-foreground text-center py-10">
          Nenhum registro de ponto encontrado.
        </div>
      )}

      {records.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Entrada 1</TableHead>
                <TableHead>Saída 1</TableHead>
                <TableHead>Entrada 2</TableHead>
                <TableHead>Saída 2</TableHead>
                <TableHead>HE Entrada</TableHead>
                <TableHead>HE Saída</TableHead>
                <TableHead>Almoço</TableHead>
                <TableHead className="text-right">HE (min)</TableHead>
                <TableHead>Alterado manualmente</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => {
                const draft = drafts[record.id] ?? {};
                const edited = hasDraftChanges(record);
                return (
                  <TableRow key={record.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatYmdToBr(record.date)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-medium">
                      {record.username ?? record.userId}
                    </TableCell>
                    {PUNCH_FIELDS.map((field) => (
                      <TableCell key={field} className="whitespace-nowrap">
                        <Input
                          type="time"
                          className="ap-time-input h-8 w-28"
                          value={draft[field] ?? record[field] ?? ""}
                          onChange={(e) => handleChange(record.id, field, e.target.value)}
                          title={FIELD_LABELS[field]}
                        />
                      </TableCell>
                    ))}
                    <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                      {record.overtimeMinutes ?? 0} min
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {record.manuallyEdited ? (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 gap-1">
                          <PencilLine className="h-3 w-3" />
                          Sim
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Não</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant={edited ? "default" : "outline"}
                        disabled={isPending}
                        onClick={() => handleSave(record)}
                      >
                        <Save className="h-4 w-4 mr-1" />
                        Salvar
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default AdminPunches;
