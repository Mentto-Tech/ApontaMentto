import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, FolderOpen } from "lucide-react";
import { useProjects, useCreateProject, useUpdateProject, useDeleteProject, type Project } from "@/lib/queries";
import "../styles/Projects.css";

const COLORS = ["#0f766e", "#2563eb", "#9333ea", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#64748b"];

const Projects = () => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  const { data: projects = [] } = useProjects();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);

  const openNew = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setColor(COLORS[0]);
    setOpen(true);
  };

  const openEdit = (p: Project) => {
    setEditing(p);
    setName(p.name);
    setDescription(p.description);
    setColor(p.color);
    setOpen(true);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    if (editing) {
      updateProject.mutate(
        { id: editing.id, name: name.trim(), description: description.trim(), color },
        { onSuccess: () => setOpen(false) }
      );
    } else {
      createProject.mutate(
        { name: name.trim(), description: description.trim(), color },
        { onSuccess: () => setOpen(false) }
      );
    }
  };

  const isPending = createProject.isPending || updateProject.isPending;

  return (
    <div className="page-projects max-w-2xl mx-auto px-4 py-6 md:py-10">
      <div className="projects-header flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Projetos</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="bg-primary">
              <Plus className="h-4 w-4 mr-1" /> Novo
            </Button>
          </DialogTrigger>
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
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
              <Button onClick={handleSave} className="w-full bg-primary" disabled={isPending}>
                {isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhum projeto cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((p, i) => (
            <div
              key={p.id}
              className="projects-item flex items-center gap-3 bg-card border border-border rounded-lg p-3 animate-fade-in"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: p.color }} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{p.name}</div>
                {p.description && <div className="text-xs text-muted-foreground truncate">{p.description}</div>}
              </div>
              <div className="projects-item-actions flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="hover-bg-gray text-black hover:text-black"
                  onClick={() => openEdit(p)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hover-bg-gray"
                  onClick={() => deleteProject.mutate(p.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Projects;
