import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, FolderOpen, MapPin } from "lucide-react";
import {
  useProjects, useCreateProject, useUpdateProject, useDeleteProject, type Project,
  useLocations, useCreateLocation, useUpdateLocation, useDeleteLocation, type Location,
} from "@/lib/queries";

const COLORS = ["#0f766e", "#2563eb", "#9333ea", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#64748b"];

// ---- Projects section ----
const ProjectsTab = () => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);

  const { data: projects = [] } = useProjects();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const openNew = () => { setEditing(null); setName(""); setDescription(""); setColor(COLORS[0]); setOpen(true); };
  const openEdit = (p: Project) => { setEditing(p); setName(p.name); setDescription(p.description); setColor(p.color); setOpen(true); };

  const handleSave = () => {
    if (!name.trim()) return;
    const payload = { name: name.trim(), description: description.trim(), color };
    const opts = { onSuccess: () => setOpen(false) };
    editing ? updateProject.mutate({ id: editing.id, ...payload }, opts) : createProject.mutate(payload, opts);
  };

  const isPending = createProject.isPending || updateProject.isPending;

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> Novo Projeto
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhum projeto cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((p) => (
            <div key={p.id} className="flex items-center gap-3 bg-card border border-border rounded-lg p-3">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: p.color }} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{p.name}</div>
                {p.description && <div className="text-xs text-muted-foreground truncate">{p.description}</div>}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Projeto" : "Novo Projeto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Nome</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do projeto" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Descrição</label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Opcional" rows={2} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Cor</label>
              <div className="flex gap-2">
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <Button onClick={handleSave} className="w-full" disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

// ---- Locations section ----
const LocationsTab = () => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");

  const { data: locations = [] } = useLocations();
  const createLocation = useCreateLocation();
  const updateLocation = useUpdateLocation();
  const deleteLocation = useDeleteLocation();

  const openNew = () => { setEditing(null); setName(""); setAddress(""); setOpen(true); };
  const openEdit = (l: Location) => { setEditing(l); setName(l.name); setAddress(l.address); setOpen(true); };

  const handleSave = () => {
    if (!name.trim()) return;
    const payload = { name: name.trim(), address: address.trim() };
    const opts = { onSuccess: () => setOpen(false) };
    editing ? updateLocation.mutate({ id: editing.id, ...payload }, opts) : createLocation.mutate(payload, opts);
  };

  const isPending = createLocation.isPending || updateLocation.isPending;

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> Novo Local
        </Button>
      </div>

      {locations.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MapPin className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhum local cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {locations.map((l) => (
            <div key={l.id} className="flex items-center gap-3 bg-card border border-border rounded-lg p-3">
              <MapPin className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{l.name}</div>
                {l.address && <div className="text-xs text-muted-foreground truncate">{l.address}</div>}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => openEdit(l)}><Pencil className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Local" : "Novo Local"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Nome</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Escritório Centro" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Endereço</label>
              <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Opcional" />
            </div>
            <Button onClick={handleSave} className="w-full" disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

// ---- Main page ----
const ProjectsAndLocations = () => (
  <div className="max-w-2xl mx-auto px-4 py-6 md:py-10">
    <h1 className="text-2xl font-bold mb-6">Projetos e Locais</h1>
    <Tabs defaultValue="projects">
      <TabsList className="mb-6">
        <TabsTrigger value="projects" className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4" /> Projetos
        </TabsTrigger>
        <TabsTrigger value="locations" className="flex items-center gap-2">
          <MapPin className="h-4 w-4" /> Locais
        </TabsTrigger>
      </TabsList>
      <TabsContent value="projects"><ProjectsTab /></TabsContent>
      <TabsContent value="locations"><LocationsTab /></TabsContent>
    </Tabs>
  </div>
);

export default ProjectsAndLocations;
