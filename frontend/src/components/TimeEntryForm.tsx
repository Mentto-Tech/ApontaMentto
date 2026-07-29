import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Coffee, Clock, MapPin, FolderOpen } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useProjects, useLocations, useCreateTimeEntry, useUpdateTimeEntry, useCreateProject, useCreateLocation, type TimeEntry } from "@/lib/queries";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  date: string;
  entry?: TimeEntry | null;
  onSuccess?: () => void;
}

const COLORS = ["#0f766e", "#2563eb", "#9333ea", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#64748b"];

const TimeEntryForm = ({ date, entry, onSuccess }: Props) => {
  const { user } = useAuth();
  const { data: projects = [] } = useProjects();
  const { data: locations = [] } = useLocations();
  const createEntry = useCreateTimeEntry();
  const updateEntry = useUpdateTimeEntry();
  
  const createProject = useCreateProject();
  const createLocation = useCreateLocation();

  const [startTime, setStartTime] = useState(entry?.startTime || "");
  const [endTime, setEndTime] = useState(entry?.endTime || "");
  const [projectId, setProjectId] = useState(entry?.projectId || "");
  const [locationId, setLocationId] = useState(entry?.locationId || "");
  const [entryType, setEntryType] = useState<"work" | "break">((entry?.entryType as "work" | "break") || "work");
  const [isOvertime, setIsOvertime] = useState(Boolean(entry?.isOvertime));

  // Estados dos modais de criação rápida
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [projectColor, setProjectColor] = useState(COLORS[0]);

  const [locationOpen, setLocationOpen] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");

  useEffect(() => {
    setStartTime(entry?.startTime || "");
    setEndTime(entry?.endTime || "");
    setProjectId(entry?.projectId || "");
    setLocationId(entry?.locationId || "");
    setEntryType((entry?.entryType as "work" | "break") || "work");
    setIsOvertime(Boolean(entry?.isOvertime));
  }, [entry]);

  const isBreak = entryType === "break";
  const isEditing = Boolean(entry);
  const isPending = createEntry.isPending || updateEntry.isPending;

  const handleSaveProject = () => {
    if (!projectName.trim()) return;
    createProject.mutate(
      { name: projectName.trim(), description: projectDesc.trim(), color: projectColor },
      {
        onSuccess: (newProj) => {
          setProjectId(newProj.id);
          setProjectOpen(false);
          setProjectName("");
          setProjectDesc("");
          setProjectColor(COLORS[0]);
        },
      }
    );
  };

  const handleSaveLocation = () => {
    if (!locationName.trim()) return;
    createLocation.mutate(
      { name: locationName.trim(), address: locationAddress.trim() },
      {
        onSuccess: (newLoc) => {
          setLocationId(newLoc.id);
          setLocationOpen(false);
          setLocationName("");
          setLocationAddress("");
        },
      }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startTime || !endTime) return;
    if (!isBreak && (!projectId || !locationId)) return;

    if (isEditing) {
      updateEntry.mutate(
        {
          id: entry.id,
          date: entry.date,
          startTime,
          endTime,
          projectId: isBreak ? (null as any) : projectId,
          locationId: isBreak ? (null as any) : locationId,
          notes: entry.notes || "",
          entryType,
          isOvertime: isBreak ? false : isOvertime,
          userId: entry.userId || user?.id || "",
        },
        {
          onSuccess: () => onSuccess?.(),
        }
      );
      return;
    }

    createEntry.mutate(
      {
        date,
        startTime,
        endTime,
        projectId: isBreak ? (null as any) : projectId,
        locationId: isBreak ? (null as any) : locationId,
        notes: "",
        entryType,
        isOvertime: isBreak ? false : isOvertime,
        userId: user?.id || "",
      },
      {
        onSuccess: () => {
          setStartTime("");
          setEndTime("");
          setProjectId("");
          setLocationId("");
          setEntryType("work");
          setIsOvertime(false);
          onSuccess?.();
        },
      }
    );
  };

  return (
    <div className="space-y-2">
      {/* Entry type toggle */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={!isBreak ? "default" : "outline"}
          size="sm"
          onClick={() => setEntryType("work")}
          className="gap-1.5"
        >
          <Clock className="h-3.5 w-3.5" />
          Atividade
        </Button>
        <Button
          type="button"
          variant={isBreak ? "default" : "outline"}
          size="sm"
          onClick={() => setEntryType("break")}
          className="gap-1.5"
        >
          <Coffee className="h-3.5 w-3.5" />
          Intervalo
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 items-end">
        <div className="flex gap-2 flex-1 w-full">
          <div className="flex-1 min-w-0">
            <label className="text-xs text-muted-foreground mb-1 block">Início</label>
            <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required />
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-xs text-muted-foreground mb-1 block">Fim</label>
            <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required />
          </div>
        </div>
        {!isBreak && (
          <div className="flex gap-2 flex-1 w-full">
            <div className="flex-1 min-w-0">
              <label className="text-xs text-muted-foreground mb-1 block">Projeto</label>
              <div className="flex gap-1 items-center">
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id} className="pl-2 [&>span:first-child]:hidden">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                          {p.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => setProjectOpen(true)}
                  title="Novo Projeto"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-xs text-muted-foreground mb-1 block">Local</label>
              <div className="flex gap-1 items-center">
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {locations.map(l => (
                      <SelectItem key={l.id} value={l.id} className="pl-2 [&>span:first-child]:hidden">{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => setLocationOpen(true)}
                  title="Novo Local"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
        <Button type="submit" size="icon" className="shrink-0 bg-primary hover:bg-primary/90" disabled={isPending}>
          <Plus className="h-4 w-4" />
        </Button>
      </form>

      {/* Overtime checkbox — only for work entries */}
      {!isBreak && (
        <div className="flex items-center gap-2 pl-1">
          <Checkbox
            id="overtime"
            checked={isOvertime}
            onCheckedChange={(checked) => setIsOvertime(checked === true)}
          />
          <label htmlFor="overtime" className="text-xs text-muted-foreground cursor-pointer select-none">
            Hora extra
          </label>
        </div>
      )}

      {/* Modal Novo Projeto */}
      <Dialog open={projectOpen} onOpenChange={setProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Projeto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Nome</label>
              <Input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="Nome do projeto" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Descrição</label>
              <Textarea value={projectDesc} onChange={e => setProjectDesc(e.target.value)} placeholder="Opcional" rows={2} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Cor</label>
              <div className="flex gap-2">
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setProjectColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${projectColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <Button onClick={handleSaveProject} className="w-full" disabled={createProject.isPending}>
              {createProject.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Novo Local */}
      <Dialog open={locationOpen} onOpenChange={setLocationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Local</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Nome</label>
              <Input value={locationName} onChange={e => setLocationName(e.target.value)} placeholder="Ex: Escritório Centro" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Endereço</label>
              <Input value={locationAddress} onChange={e => setLocationAddress(e.target.value)} placeholder="Opcional" />
            </div>
            <Button onClick={handleSaveLocation} className="w-full" disabled={createLocation.isPending}>
              {createLocation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TimeEntryForm;
