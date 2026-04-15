import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Coffee, Clock } from "lucide-react";
import { useProjects, useLocations, useCreateTimeEntry } from "@/lib/queries";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  date: string;
}

const TimeEntryForm = ({ date }: Props) => {
  const { user } = useAuth();
  const { data: projects = [] } = useProjects();
  const { data: locations = [] } = useLocations();
  const createEntry = useCreateTimeEntry();

  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [projectId, setProjectId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [entryType, setEntryType] = useState<"work" | "break">("work");
  const [isOvertime, setIsOvertime] = useState(false);

  const isBreak = entryType === "break";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startTime || !endTime) return;
    if (!isBreak && (!projectId || !locationId)) return;

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
        userId: user?.id,
      },
      {
        onSuccess: () => {
          setStartTime("");
          setEndTime("");
          setProjectId("");
          setLocationId("");
          setIsOvertime(false);
        },
      }
    );
  };

  const hasProjectsAndLocations = projects.length > 0 && locations.length > 0;

  if (!hasProjectsAndLocations) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-center text-sm text-muted-foreground">
        Cadastre ao menos um <strong>projeto</strong> e um <strong>local</strong> para começar a registrar.
      </div>
    );
  }

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
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-xs text-muted-foreground mb-1 block">Local</label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {locations.map(l => (
                    <SelectItem key={l.id} value={l.id} className="pl-2 [&>span:first-child]:hidden">{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <Button type="submit" size="icon" className="shrink-0 bg-primary hover:bg-primary/90" disabled={createEntry.isPending}>
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
    </div>
  );
};

export default TimeEntryForm;
