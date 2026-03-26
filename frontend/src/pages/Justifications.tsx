import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Download, FileText, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetchBlob } from "@/lib/api";
import { useCreateJustification, useDeleteJustification, useJustifications, useUsers } from "@/lib/queries";
import "../styles/Justifications.css";

const Justifications = () => {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedUserId, setSelectedUserId] = useState<string>("all");

  useEffect(() => {
    if (!isAdmin && user?.id) {
      setSelectedUserId(user.id);
    }
  }, [isAdmin, user?.id]);

  const monthStr = format(currentMonth, "yyyy-MM");
  const targetUserId = isAdmin ? selectedUserId : user?.id || "";

  const { data: allUsers = [] } = useUsers();

  const userMap = useMemo(() => Object.fromEntries(allUsers.map((u) => [u.id, u])), [allUsers]);

  const formatBrDate = (iso: string) => {
    try {
      return format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return iso;
    }
  };

  const { data: justifications = [] } = useJustifications({
    month: monthStr,
    userId: isAdmin && selectedUserId !== "all" ? targetUserId : undefined,
  });
  const createJustification = useCreateJustification();
  const deleteJustification = useDeleteJustification();

  const [justDate, setJustDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [justText, setJustText] = useState("");
  const [justFile, setJustFile] = useState<File | null>(null);

  const targetUser = useMemo(() => {
    return isAdmin && selectedUserId !== "all"
      ? allUsers.find((u) => u.id === targetUserId)
      : user;
  }, [allUsers, isAdmin, targetUserId, user]);

  const prevMonth = () => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const handleCreateJustification = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append("date", justDate);
    fd.append("reasonText", justText);
    if (justFile) fd.append("file", justFile);

    createJustification.mutate(fd, {
      onSuccess: () => {
        setJustText("");
        setJustFile(null);
      },
    });
  };

  const handleDownload = async (id: string, filename?: string | null) => {
    try {
      const blob = await apiFetchBlob(`/api/justifications/${id}/file`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `atestado-${id}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao baixar arquivo";
      toast({
        variant: "destructive",
        title: "Erro ao baixar",
        description:
          message === "File missing" || message === "No file"
            ? "Arquivo não encontrado (pode ter sido removido no servidor)."
            : message,
      });
    }
  };

  return (
    <div className="page-justifications max-w-3xl mx-auto px-4 py-6 md:py-10">
      <h1 className="justifications-header text-2xl font-bold mb-6 flex items-center gap-2">
        <FileText className="h-6 w-6 text-primary" />
        Justificativas
      </h1>

      <div className="bg-card border border-border rounded-lg p-3 mb-4">
        <div className="justifications-month flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-semibold capitalize">
            {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </div>
          <Button variant="ghost" size="icon" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {isAdmin && (
          <div className="mt-3">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o usuário" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {allUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="mt-2 text-xs text-muted-foreground">
          Exibindo: {isAdmin ? (selectedUserId === "all" ? "Todos" : targetUser?.username || "—") : targetUser?.username || "—"}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4 space-y-4">
        <div>
          <div className="text-sm font-semibold">Justificativa de falta</div>
          <div className="text-xs text-muted-foreground">
            Adicione texto e/ou anexe um atestado. O download é protegido por login.
          </div>
        </div>

        <form onSubmit={handleCreateJustification} className="space-y-3">
          <div className="justifications-form-grid grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Data</label>
              <Input type="date" value={justDate} onChange={(e) => setJustDate(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Atestado (PDF/JPG/PNG)</label>
              <Input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={(e) => setJustFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Justificativa</label>
            <Textarea
              value={justText}
              onChange={(e) => setJustText(e.target.value)}
              placeholder="Ex.: Consulta médica / afastamento / etc."
            />
          </div>

          <Button type="submit" disabled={createJustification.isPending}>
            <Upload className="h-4 w-4 mr-2" /> Enviar justificativa
          </Button>
        </form>

        <div className="space-y-2">
          {justifications.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhuma justificativa neste mês.</div>
          ) : (
            justifications.map((j) => (
              <div
                key={j.id}
                className="justifications-card flex flex-col md:flex-row md:items-center md:justify-between gap-2 border border-border rounded-lg p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold flex flex-wrap items-center gap-2">
                    {isAdmin ? (
                      <span className="text-muted-foreground">{userMap[j.userId]?.username || j.userId}</span>
                    ) : null}
                    <span>{formatBrDate(j.date)}</span>
                  </div>
                  {j.reasonText && (
                    <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{j.reasonText}</div>
                  )}
                  {j.originalFilename && (
                    <div className="text-xs text-muted-foreground">Arquivo: {j.originalFilename}</div>
                  )}
                </div>
                <div className="justifications-card-actions flex items-center gap-2">
                  {j.originalFilename && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleDownload(j.id, j.originalFilename)}
                    >
                      <Download className="h-4 w-4 mr-2" /> Baixar
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => deleteJustification.mutate(j.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Excluir
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Justifications;
