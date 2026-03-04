import { useState } from "react";
import { format, addDays, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import TimeEntryForm from "@/components/TimeEntryForm";
import { useTimeEntries, useProjects, useLocations, useDeleteTimeEntry } from "@/lib/queries";

const Index = () => {
  const [date, setDate] = useState(new Date());

  const dateStr = format(date, "yyyy-MM-dd");
  const { data: entries = [] } = useTimeEntries({ date: dateStr });
  const { data: projects = [] } = useProjects();
  const { data: locations = [] } = useLocations();
  const deleteEntry = useDeleteTimeEntry();

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));
  const locationMap = Object.fromEntries(locations.map(l => [l.id, l]));

  const totalMinutes = entries.reduce((sum, e) => {
    const [sh, sm] = e.startTime.split(":").map(Number);
    const [eh, em] = e.endTime.split(":").map(Number);
    return sum + (eh * 60 + em) - (sh * 60 + sm);
  }, 0);

  const totalHours = Math.floor(totalMinutes / 60);
  const totalMins = totalMinutes % 60;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-10">
      <h1 className="text-2xl font-bold mb-6">Registros do Dia</h1>

      {/* Date navigator */}
      <div className="flex items-center justify-between mb-6 bg-card rounded-lg border border-border p-3">
        <Button variant="ghost" size="icon" onClick={() => setDate(d => subDays(d, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center">
          <div className="text-sm font-semibold capitalize">
            {format(date, "EEEE", { locale: ptBR })}
          </div>
          <div className="text-lg font-bold">
            {format(date, "dd 'de' MMMM, yyyy", { locale: ptBR })}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setDate(d => addDays(d, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Add entry form */}
      <div className="mb-6">
        <TimeEntryForm date={dateStr} />
      </div>

      {/* Entries list */}
      <div className="space-y-2">
        {entries.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nenhum registro para este dia.</p>
          </div>
        ) : (
          <>
            {entries.map((entry, i) => {
              const project = projectMap[entry.projectId];
              const location = locationMap[entry.locationId];
              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 bg-card border border-border rounded-lg p-3 animate-fade-in"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div
                    className="w-1 h-10 rounded-full shrink-0"
                    style={{ background: project?.color || "hsl(var(--primary))" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <span>{entry.startTime}</span>
                      <span className="text-muted-foreground">→</span>
                      <span>{entry.endTime}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {project?.name || "—"} · {location?.name || "—"}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteEntry.mutate(entry.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}

            {/* Total */}
            <div className="flex justify-end pt-2 text-sm font-semibold text-primary">
              Total: {totalHours}h {totalMins > 0 ? `${totalMins}min` : ""}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Index;
