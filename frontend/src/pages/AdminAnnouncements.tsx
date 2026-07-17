import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Bell, BellOff, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";

interface Announcement {
  id: string;
  title: string;
  body: string;
  imageUrl?: string | null;
  isActive: boolean;
  createdAt: string;
  activatedAt?: string | null;
}

const emptyForm = { title: "", body: "", imageUrl: "" };

const AdminAnnouncements = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: announcements = [], isLoading } = useQuery<Announcement[]>({
    queryKey: ["announcements"],
    queryFn: () => apiFetch<Announcement[]>("/api/announcements"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["announcements"] });

  const createMutation = useMutation({
    mutationFn: async (data: typeof emptyForm) => {
      const ann = await apiFetch<Announcement>("/api/announcements", {
        method: "POST",
        body: { ...data, imageUrl: data.imageUrl || null },
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
        body: { ...data, imageUrl: data.imageUrl || null },
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
    onSuccess: () => { invalidate(); toast.success("Aviso disparado para todos os usuários"); },
    onError: () => toast.error("Erro ao disparar aviso"),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/announcements/${id}/deactivate`, { method: "POST" }),
    onSuccess: () => { invalidate(); toast.success("Aviso cancelado"); },
    onError: () => toast.error("Erro ao cancelar aviso"),
  });

  // Returns the URL to display an announcement image (S3 key proxied via backend, or external URL)
  const imageDisplayUrl = (a: Announcement) =>
    a.imageUrl ? (a.imageUrl.startsWith("http") ? a.imageUrl : `/api/announcements/${a.id}/image`) : null;

  const openCreate = () => { setEditing(null); setForm(emptyForm); setImageFile(null); setImagePreview(null); setDialogOpen(true); };
  const openEdit = (a: Announcement) => {
    setEditing(a);
    setForm({ title: a.title, body: a.body, imageUrl: a.imageUrl?.startsWith("http") ? a.imageUrl : "" });
    setImageFile(null);
    // Show existing S3 image via backend proxy, or external URL directly
    setImagePreview(imageDisplayUrl(a));
    setDialogOpen(true);
  };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); setForm(emptyForm); setImageFile(null); setImagePreview(null); };

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
    setForm((f) => ({ ...f, imageUrl: "" })); // clear manual URL when file is chosen
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) { toast.error("Título e corpo são obrigatórios"); return; }
    editing ? updateMutation.mutate(form) : createMutation.mutate(form);
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
          {announcements.map((a) => (
            <Card key={a.id} className={`p-4 ${a.isActive ? "border-primary/60 bg-primary/5" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{a.title}</span>
                    {a.isActive && <Badge variant="default" className="text-xs">Ativo</Badge>}
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
                <div className="flex gap-1 shrink-0">
                  {a.isActive ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deactivateMutation.mutate(a.id)}
                      disabled={deactivateMutation.isPending}
                      title="Cancelar aviso"
                    >
                      <BellOff className="h-4 w-4 text-destructive" />
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => activateMutation.mutate(a.id)}
                      disabled={activateMutation.isPending}
                      title="Disparar aviso"
                      className="group"
                    >
                      <Bell className="h-4 w-4 text-primary group-hover:text-white" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => openEdit(a)} title="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { if (confirm("Remover aviso?")) deleteMutation.mutate(a.id); }}
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Aviso" : "Novo Aviso"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Título</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Título do aviso"
                required
              />
            </div>
            <div>
              <Label>Corpo</Label>
              <Textarea
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="Texto do aviso..."
                rows={5}
                required
              />
            </div>
            <div>
              <Label>Imagem (opcional)</Label>
              {/* File upload */}
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
                    <span className="text-xs text-muted-foreground">JPEG, PNG, GIF, WebP · máx 10 MB</span>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
              {/* Or URL */}
              {!imageFile && (
                <div className="mt-2">
                  <Label className="text-xs text-muted-foreground">ou cole uma URL</Label>
                  <Input
                    value={form.imageUrl}
                    onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                    placeholder="https://..."
                    className="mt-1"
                  />
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
    </div>
  );
};

export default AdminAnnouncements;
