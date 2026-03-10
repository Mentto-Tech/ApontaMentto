import { useState, useEffect } from "react";
import { format, addDays, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Trash2, Clock, Coffee, Zap, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import TimeEntryForm from "@/components/TimeEntryForm";
import { useTimeEntries, useProjects, useLocations, useDeleteTimeEntry, useDailyRecords, useUpsertDailyRecord } from "@/lib/queries";

const Index = () => {
  const [date, setDate] = useState(new Date());

  const dateStr = format(date, "yyyy-MM-dd");
  const { data: entries = [] } = useTimeEntries({ date: dateStr });
  const { data: projects = [] } = useProjects();
  const { data: locations = [] } = useLocations();
  const deleteEntry = useDeleteTimeEntry();

  // Clock-in / clock-out
  const { data: dailyRecords = [] } = useDailyRecords({ date: dateStr });
  const upsertDailyRecord = useUpsertDailyRecord();
  const todayRecord = dailyRecords.find(r => r.date === dateStr);
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");

  useEffect(() => {
    setClockIn(todayRecord?.clockIn || "");
    setClockOut(todayRecord?.clockOut || "");
  }, [todayRecord, dateStr]);

  const handleClockSave = () => {
    upsertDailyRecord.mutate({
      date: dateStr,
      clockIn: clockIn || null,
      clockOut: clockOut || null,
    });
  };

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));
  const locationMap = Object.fromEntries(locations.map(l => [l.id, l]));

  // Only count work entries (exclude breaks) for total
  const workEntries = entries.filter(e => e.entryType !== "break");
  const totalMinutes = workEntries.reduce((sum, e) => {
    const [sh, sm] = e.startTime.split(":").map(Number);
    const [eh, em] = e.endTime.split(":").map(Number);
    return sum + (eh * 60 + em) - (sh * 60 + sm);
  }, 0);

  const breakEntries = entries.filter(e => e.entryType === "break");
  const breakMinutes = breakEntries.reduce((sum, e) => {
    const [sh, sm] = e.startTime.split(":").map(Number);
    const [eh, em] = e.endTime.split(":").map(Number);
    return sum + (eh * 60 + em) - (sh * 60 + sm);
  }, 0);

  const totalHours = Math.floor(totalMinutes / 60);
  const totalMins = totalMinutes % 60;
  const breakH = Math.floor(breakMinutes / 60);
  const breakM = breakMinutes % 60;

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

      {/* Clock-in / Clock-out section */}
      <div className="mb-4 bg-card border border-border rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Registro do Dia</span>
          <span className="text-[10px] text-muted-foreground">(opcional)</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2">
            <LogIn className="h-3.5 w-3.5 text-green-600" />
            <div>
              <label className="text-xs text-muted-foreground block">Entrada</label>
              <Input
                type="time"
                value={clockIn}
                onChange={e => setClockIn(e.target.value)}
                onBlur={handleClockSave}
                className="w-[110px] h-8 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LogOut className="h-3.5 w-3.5 text-red-500" />
            <div>
              <label className="text-xs text-muted-foreground block">Saída</label>
              <Input
                type="time"
                value={clockOut}
                onChange={e => setClockOut(e.target.value)}
                onBlur={handleClockSave}
                className="w-[110px] h-8 text-sm"
              />
            </div>
          </div>
        </div>
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
              const isBrk = entry.entryType === "break";
              return (
                <div
                  key={entry.id}
                  className={`flex items-center gap-3 bg-card border rounded-lg p-3 animate-fade-in ${
                    isBrk ? "border-orange-200 bg-orange-50/50 dark:border-orange-900/40 dark:bg-orange-950/20" : "border-border"
                  }`}
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  {isBrk ? (
                    <div className="w-1 h-10 rounded-full shrink-0 bg-orange-400" />
                  ) : (
                    <div
                      className="w-1 h-10 rounded-full shrink-0"
                      style={{ background: project?.color || "hsl(var(--primary))" }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <span>{entry.startTime}</span>
                      <span className="text-muted-foreground">→</span>
                      <span>{entry.endTime}</span>
                      {isBrk && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-orange-600 bg-orange-100 dark:bg-orange-900/40 dark:text-orange-400 px-1.5 py-0.5 rounded-full">
                          <Coffee className="h-3 w-3" /> Intervalo
                        </span>
                      )}
                      {entry.isOvertime && !isBrk && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
                          <Zap className="h-3 w-3" /> HE
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {isBrk ? "Intervalo" : `${project?.name || "—"} · ${location?.name || "—"}`}
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
            <div className="flex flex-col items-end gap-1 pt-2 text-sm font-semibold">
              <span className="text-primary">
                Trabalho: {totalHours}h {totalMins > 0 ? `${totalMins}min` : ""}
              </span>
              {breakMinutes > 0 && (
                <span className="text-orange-500 text-xs">
                  Intervalos: {breakH}h {breakM > 0 ? `${breakM}min` : ""}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Index;
