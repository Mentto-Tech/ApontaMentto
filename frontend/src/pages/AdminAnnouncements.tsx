import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, Bell, BellOff, ImagePlus, X, Send, Clock, CalendarClock, Users } from "lucide-react";
import { toast } from "sonner";

interface Announcement {
  id: string;
  title: string;
  body: string;
  imageUrl?: string | null;
  isActive: boolean;
  createdAt: string;
  createdById?: string | null;
  activatedAt?: string | null;
  pushRepeatIntervalMinutes?: number | null;
  pushRepeatUntil?: string | null;
  pushLastSentAt?: string | null;
  pushScheduleTimes?: string[];
  targetAll: boolean;
  targetUserIds: string[];
}

interface UserOption {
  id: string;
  username: string;
  email: string;
}

const emptyForm = {
  title: "",
  body: "",
  imageUrl: "",
  targetAll: true,
  targetUserIds: [] as string[],
};

const AdminAnnouncements = () => {
  const { isAdmin, user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleTarget, setScheduleTarget] = useState<Announcement | null>(null);
  const [scheduleTimes, setScheduleTimes] = useState<string[]>([]);
  const [scheduleTimeInput, setScheduleTimeInput] = useState("07:00");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: announcements = [], isLoading } = useQuery<Announcement[]>({
    queryKey: ["announcements"],
    queryFn: () => apiFetch<Announcement[]>("/api/announcements"),
  });

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: () => apiFetch<UserOption[]>("/api/users"),
    enabled: isAdmin,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["announcements"] });

  const createMutation = useMutation({
    mutationFn: async (data: typeof emptyForm) => {
      const ann = await apiFetch<Announcement>("/api/announcements", {
        method: "POST",
        body: {
          title: data.title,
          body: data.body,
          imageUrl: data.imageUrl || null,
          targetAll: isAdmin ? data.targetAll : false,
          targetUserIds: isAdmin ? (data.targetAll ? [] : data.targetUserIds) : [],
        },
      });
      if (imageFile) await uploadImage(ann.id, imageFile);
      return ann;
    },
    onSuccess: () => { invalidate(); closeDialog(); toast.success("Aviso criado"); },
    onError: () => toast.error("Erro ao criar aviso"),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof emptyForm) => {
      const ann = await apiFetch<Announcement>(`/api/announcements/${editing!.id}`, {
        method: "PUT",
        body: {
          title: data.title,
          body: data.body,
          imageUrl: data.imageUrl || null,
          targetAll: isAdmin ? data.targetAll : false,
          targetUserIds: isAdmin ? (data.targetAll ? [] : data.targetUserIds) : [],
        },
      });
      if (imageFile) await uploadImage(ann.id, imageFile);
      return ann;
    },
    onSuccess: () => { invalidate(); closeDialog(); toast.success("Aviso atualizado"); },
    onError: () => toast.error("Erro ao atualizar aviso"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/announcements/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); toast.success("Aviso removido"); },
    onError: () => toast.error("Erro ao remover aviso"),
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/announcements/${id}/activate`, { method: "POST" }),
    onSuccess: () => { invalidate(); toast.success("Aviso ativado"); },
    onError: () => toast.error("Erro ao ativar aviso"),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/announcements/${id}/deactivate`, { method: "POST" }),
    onSuccess: () => { invalidate(); toast.success("Aviso desativado"); },
    onError: () => toast.error("Erro ao desativar aviso"),
  });

  const pushMutation = useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: boolean; sentCount: number }>(`/api/announcements/${id}/push`, { method: "POST" }),
    onSuccess: (res) => toast.success(`PUSH enviado para ${res.sentCount} dispositivo(s)`),
    onError: () => toast.error("Erro ao enviar PUSH"),
  });

  const scheduleMutation = useMutation({
    mutationFn: ({ id, times }: { id: string; times: string[] }) =>
      apiFetch<Announcement>(`/api/announcements/${id}/schedule`, {
        method: "POST",
        body: { times },
      }),
    onSuccess: () => { invalidate(); setScheduleDialogOpen(false); toast.success("Agendamento configurado"); },
    onError: () => toast.error("Erro ao configurar agendamento"),
  });

  const imageDisplayUrl = (a: Announcement) =>
    a.imageUrl ? (a.imageUrl.startsWith("http") ? a.imageUrl : `/api/announcements/${a.id}/image`) : null;

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setImageFile(null);
    setImagePreview(null);
    setDialogOpen(true);
  };

  const openEdit = (a: Announcement) => {
    setEditing(a);
    setForm({
      title: a.title,
      body: a.body,
      imageUrl: a.imageUrl || "",
      targetAll: a.targetAll,
      targetUserIds: a.targetUserIds ?? [],
    });
    setImageFile(null);
    setImagePreview(imageDisplayUrl(a));
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setImageFile(null);
    setImagePreview(null);
  };

  const openSchedule = (a: Announcement) => {
    setScheduleTarget(a);
    setScheduleTimes(a.pushScheduleTimes ?? []);
    setScheduleTimeInput("07:00");
    setScheduleDialogOpen(true);
  };

  const addScheduleTime = () => {
    // Snap to nearest 10-min
    const [h, m] = scheduleTimeInput.split(":").map(Number);
    const snapped = `${String(h).padStart(2, "0")}:${String(Math.round(m / 10) * 10).padStart(2, "0")}`;
    const fixed = snapped.endsWith(":60") ? `${String(h + 1).padStart(2, "0")}:00` : snapped;
    if (!scheduleTimes.includes(fixed)) {
      setScheduleTimes((prev) => [...prev, fixed].sort());
    }
  };

  const removeScheduleTime = (t: string) => setScheduleTimes((prev) => prev.filter((x) => x !== t));

  const uploadImage = async (announcementId: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    await apiFetch(`/api/announcements/${announcementId}/upload-image`, { method: "POST", body: fd });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setForm((f) => ({ ...f, imageUrl: "" }));
  };

  const toggleTargetUser = (uid: string) => {
    setForm((f) => ({
      ...f,
      targetUserIds: f.targetUserIds.includes(uid)
        ? f.targetUserIds.filter((id) => id !== uid)
        : [...f.targetUserIds, uid],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) { toast.error("Título e corpo são obrigatórios"); return; }
    editing ? updateMutation.mutate(form) : createMutation.mutate(form);
  };

  const canEdit = (a: Announcement) => isAdmin || a.createdById === user?.id;

  const targetLabel = (a: Announcement) => {
    if (a.targetAll) return null;
    if (a.targetUserIds.length === 0) return "Nenhum destinatário";
    if (a.targetUserIds.length === 1) {
      const u = users.find((x) => x.id === a.targetUserIds[0]);
      return u?.username ?? "1 usuário";
    }
    return `${a.targetUserIds.length} usuários`;
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl sm:text-2xl font-bold">Avisos</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Aviso
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : announcements.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Nenhum aviso cadastrado</div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => {
            const label = targetLabel(a);
            return (
              <Card key={a.id} className={`p-4 ${a.isActive ? "border-primary/60 bg-primary/5" : ""}`}>
                <div className="flex flex-col gap-2">
                  {/* Content */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold text-sm">{a.title}</span>
                        {a.isActive && <Badge variant="default" className="text-xs">Ativo</Badge>}
                        {(a.pushScheduleTimes?.length ?? 0) > 0 && (
                          <Badge variant="outline" className="text-xs flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {a.pushScheduleTimes!.length} horário{a.pushScheduleTimes!.length > 1 ? "s" : ""}
                          </Badge>
                        )}
                        {!a.targetAll && label && (
                          <Badge variant="secondary" className="text-xs flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {label}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">{a.body}</p>
                      {a.imageUrl && (
                        <img
                          src={imageDisplayUrl(a)!}
                          alt="Imagem do aviso"
                          className="mt-2 h-16 rounded-md object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                    </div>
                    {/* Desktop: botões ao lado (md+) */}
                    {canEdit(a) && (
                      <div className="hidden md:flex gap-1 shrink-0">
                        {a.isActive ? (
                          <Button variant="outline" size="sm" onClick={() => deactivateMutation.mutate(a.id)} disabled={deactivateMutation.isPending} title="Desativar aviso" className="group hover:bg-destructive hover:border-destructive">
                            <BellOff className="h-4 w-4 text-destructive group-hover:text-white transition-colors" />
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => activateMutation.mutate(a.id)} disabled={activateMutation.isPending} title="Ativar aviso" className="group hover:bg-primary hover:border-primary">
                            <Bell className="h-4 w-4 text-primary group-hover:text-white transition-colors" />
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => pushMutation.mutate(a.id)} disabled={pushMutation.isPending} title="Enviar PUSH agora" className="group hover:bg-primary hover:border-primary">
                          <Send className="h-4 w-4 text-primary group-hover:text-white transition-colors" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openSchedule(a)} title="Agendar PUSH recorrente" className={`group hover:bg-primary hover:border-primary ${(a.pushScheduleTimes?.length ?? 0) > 0 ? "border-primary/50 text-primary" : ""}`}>
                          <CalendarClock className="h-4 w-4 group-hover:text-white transition-colors" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(a)} title="Editar" className="group hover:bg-primary">
                          <Pencil className="h-4 w-4 group-hover:text-white transition-colors" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { if (confirm("Remover aviso?")) deleteMutation.mutate(a.id); }} title="Excluir" className="group hover:bg-destructive">
                          <Trash2 className="h-4 w-4 text-destructive group-hover:text-white transition-colors" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {/* Mobile: botões no footer do card */}
                  {canEdit(a) && (
                    <div className="flex md:hidden gap-1 pt-2 border-t border-border">
                      {a.isActive ? (
                        <Button variant="outline" size="sm" onClick={() => deactivateMutation.mutate(a.id)} disabled={deactivateMutation.isPending} title="Desativar aviso" className="group hover:bg-destructive hover:border-destructive">
                          <BellOff className="h-4 w-4 text-destructive group-hover:text-white transition-colors" />
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => activateMutation.mutate(a.id)} disabled={activateMutation.isPending} title="Ativar aviso" className="group hover:bg-primary hover:border-primary">
                          <Bell className="h-4 w-4 text-primary group-hover:text-white transition-colors" />
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => pushMutation.mutate(a.id)} disabled={pushMutation.isPending} title="Enviar PUSH agora" className="group hover:bg-primary hover:border-primary">
                        <Send className="h-4 w-4 text-primary group-hover:text-white transition-colors" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openSchedule(a)} title="Agendar PUSH recorrente" className={`group hover:bg-primary hover:border-primary ${(a.pushScheduleTimes?.length ?? 0) > 0 ? "border-primary/50 text-primary" : ""}`}>
                        <CalendarClock className="h-4 w-4 group-hover:text-white transition-colors" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(a)} title="Editar" className="group hover:bg-primary">
                        <Pencil className="h-4 w-4 group-hover:text-white transition-colors" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { if (confirm("Remover aviso?")) deleteMutation.mutate(a.id); }} title="Excluir" className="group hover:bg-destructive">
                        <Trash2 className="h-4 w-4 text-destructive group-hover:text-white transition-colors" />
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) closeDialog(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Aviso" : "Novo Aviso"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Título</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Título do aviso" required />
            </div>
            <div>
              <Label>Corpo</Label>
              <Textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder="Texto do aviso..." rows={4} required />
            </div>

            {/* Destinatários — visível apenas para admin */}
            {isAdmin && (
              <div className="space-y-2">
                <Label>Destinatários</Label>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="target-all"
                    checked={form.targetAll}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, targetAll: !!v, targetUserIds: [] }))}
                  />
                  <label htmlFor="target-all" className="text-sm cursor-pointer">Todos os usuários</label>
                </div>
                {!form.targetAll && (
                  <div className="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
                    {users.length === 0 && <p className="text-xs text-muted-foreground">Nenhum usuário encontrado</p>}
                    {users.map((u) => (
                      <div key={u.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`user-${u.id}`}
                          checked={form.targetUserIds.includes(u.id)}
                          onCheckedChange={() => toggleTargetUser(u.id)}
                        />
                        <label htmlFor={`user-${u.id}`} className="text-sm cursor-pointer">
                          {u.username} <span className="text-muted-foreground text-xs">({u.email})</span>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Imagem */}
            <div>
              <Label>Imagem (opcional)</Label>
              <div
                className="mt-1 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-4 cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {imagePreview ? (
                  <div className="relative w-full">
                    <img src={imagePreview} alt="Preview" className="w-full max-h-40 object-cover rounded-md" />
                    <button
                      type="button"
                      className="absolute top-1 right-1 bg-background rounded-full p-0.5 shadow"
                      onClick={(e) => { e.stopPropagation(); setImageFile(null); setImagePreview(null); setForm((f) => ({ ...f, imageUrl: "" })); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <ImagePlus className="h-6 w-6 text-muted-foreground mb-1" />
                    <span className="text-xs text-muted-foreground">Clique para selecionar uma imagem</span>
                  </>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleFileChange} />
              {!imageFile && (
                <div className="mt-2">
                  <Label className="text-xs text-muted-foreground">ou cole uma URL</Label>
                  <Input value={form.imageUrl} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))} placeholder="https://..." className="mt-1" />
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editing ? "Salvar" : "Criar"}
              </Button>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancelar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={(v) => { if (!v) setScheduleDialogOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Horários de PUSH diário</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Aviso: <span className="font-medium text-foreground">"{scheduleTarget?.title}"</span>
          </p>
          <p className="text-xs text-muted-foreground">A notificação será enviada todos os dias nos horários abaixo. Os minutos devem ser múltiplos de 10.</p>

          {/* Add time */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label className="text-xs mb-1 block">Adicionar horário</Label>
              <Input
                type="time"
                step={600}
                value={scheduleTimeInput}
                onChange={(e) => setScheduleTimeInput(e.target.value)}
                className="w-full"
              />
            </div>
            <Button type="button" size="sm" onClick={addScheduleTime} className="group hover:bg-primary">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Time list */}
          {scheduleTimes.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">Nenhum horário adicionado</p>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {scheduleTimes.map((t) => (
                <span key={t} className="flex items-center gap-1 bg-primary/10 text-primary text-xs font-mono px-2 py-1 rounded-full">
                  {t}
                  <button type="button" onClick={() => removeScheduleTime(t)} className="hover:text-destructive transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              disabled={scheduleMutation.isPending}
              onClick={() => scheduleTarget && scheduleMutation.mutate({ id: scheduleTarget.id, times: scheduleTimes })}
            >
              Salvar
            </Button>
            {(scheduleTarget?.pushScheduleTimes?.length ?? 0) > 0 && (
              <Button
                type="button"
                variant="destructive"
                disabled={scheduleMutation.isPending}
                onClick={() => scheduleTarget && scheduleMutation.mutate({ id: scheduleTarget.id, times: [] })}
              >
                Limpar
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => setScheduleDialogOpen(false)}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminAnnouncements;
