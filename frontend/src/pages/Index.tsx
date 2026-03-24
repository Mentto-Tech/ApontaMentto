import { useMemo, useState, useEffect } from "react";
import { format, addDays, subDays, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Trash2, Clock, Coffee, Zap, LogIn, LogOut, MapPin } from "lucide-react";
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
  const [in1, setIn1] = useState("");
  const [out1, setOut1] = useState("");
  const [in2, setIn2] = useState("");
  const [out2, setOut2] = useState("");
  const [overtimeMinutes, setOvertimeMinutes] = useState("");
  const [editingField, setEditingField] = useState<null | "in1" | "out1" | "in2" | "out2" | "overtime">(null);

  useEffect(() => {
    setIn1(todayRecord?.in1 || todayRecord?.clockIn || "");
    setOut1(todayRecord?.out1 || "");
    setIn2(todayRecord?.in2 || "");
    setOut2(todayRecord?.out2 || todayRecord?.clockOut || "");
    setOvertimeMinutes(
      todayRecord?.overtimeMinutes !== undefined && todayRecord?.overtimeMinutes !== null
        ? String(todayRecord.overtimeMinutes)
        : ""
    );
  }, [todayRecord, dateStr]);

  type GeoPayload = { geoLat: number; geoLng: number; geoAccuracy?: number; geoSource: string };

  const tryGetDeviceGeo = async (): Promise<GeoPayload | null> => {
    if (!("geolocation" in navigator)) return null;
    return new Promise<GeoPayload | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            geoLat: pos.coords.latitude,
            geoLng: pos.coords.longitude,
            geoAccuracy: pos.coords.accuracy,
            geoSource: "device",
          });
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 60_000 }
      );
    });
  };

  const handleClockSave = async (
    override?: Partial<{
    in1: string | null;
    out1: string | null;
    in2: string | null;
    out2: string | null;
    overtimeMinutes: number | null;
  }>,
    opts?: { captureGeo?: boolean }
  ) => {
    const geo = opts?.captureGeo ? await tryGetDeviceGeo() : null;

    const overtime = overtimeMinutes.trim() ? Number(overtimeMinutes) : null;
    let payload = {
      date: dateStr,
      in1: override?.in1 ?? (in1 || null),
      out1: override?.out1 ?? (out1 || null),
      in2: override?.in2 ?? (in2 || null),
      out2: override?.out2 ?? (out2 || null),
      overtimeMinutes:
        override?.overtimeMinutes ??
        (Number.isFinite(overtime as number) ? (overtime as number) : null),
    } as const;

    if (geo) {
      payload = { ...payload, ...geo };
    }

    upsertDailyRecord.mutate(payload);
  };

  const isToday = useMemo(() => isSameDay(date, new Date()), [date]);

  const nextPunchField = useMemo(() => {
    if (!in1) return "in1" as const;
    if (!out1) return "out1" as const;
    if (!in2) return "in2" as const;
    if (!out2) return "out2" as const;
    return null;
  }, [in1, out1, in2, out2]);

  const nextPunchLabel = useMemo(() => {
    switch (nextPunchField) {
      case "in1":
        return "Entrada 1";
      case "out1":
        return "Saída 1";
      case "in2":
        return "Entrada 2";
      case "out2":
        return "Saída 2";
      default:
        return null;
    }
  }, [nextPunchField]);

  const handlePunchNow = async () => {
    if (!isToday) return;
    if (!nextPunchField) return;

    const nowTime = format(new Date(), "HH:mm");

    if (nextPunchField === "in1") setIn1(nowTime);
    if (nextPunchField === "out1") setOut1(nowTime);
    if (nextPunchField === "in2") setIn2(nowTime);
    if (nextPunchField === "out2") setOut2(nowTime);

    const override: Partial<{
      in1: string | null;
      out1: string | null;
      in2: string | null;
      out2: string | null;
      overtimeMinutes: number | null;
    }> = {};

    if (nextPunchField === "in1") override.in1 = nowTime;
    if (nextPunchField === "out1") override.out1 = nowTime;
    if (nextPunchField === "in2") override.in2 = nowTime;
    if (nextPunchField === "out2") override.out2 = nowTime;

    await handleClockSave(override, { captureGeo: true });
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

        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="text-xs text-muted-foreground">
            {isToday ? (
              <span>Use <strong>Bater ponto</strong> para salvar a hora atual.</span>
            ) : (
              <span>Para bater ponto, selecione o dia de hoje.</span>
            )}
          </div>
          <Button
            onClick={() => void handlePunchNow()}
            disabled={!isToday || !nextPunchField || upsertDailyRecord.isPending || editingField !== null}
            className="shrink-0"
          >
            <MapPin className="h-4 w-4 mr-2" />
            Bater ponto{nextPunchLabel ? ` (${nextPunchLabel})` : ""}
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2">
            <LogIn className="h-3.5 w-3.5 text-green-600" />
            <div>
              <label className="text-xs text-muted-foreground block">Entrada 1</label>
              <Input
                type="time"
                value={in1}
                onChange={e => setIn1(e.target.value)}
                disabled={editingField !== "in1"}
                className="w-[110px] h-8 text-sm"
              />
              <div className="mt-1 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={editingField === "in1" ? "secondary" : "outline"}
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setEditingField(editingField === "in1" ? null : "in1")}
                >
                  {editingField === "in1" ? "Cancelar" : "Editar"}
                </Button>
                {editingField === "in1" && (
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => {
                      setEditingField(null);
                      void handleClockSave(undefined, { captureGeo: false });
                    }}
                  >
                    Salvar
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LogOut className="h-3.5 w-3.5 text-red-500" />
            <div>
              <label className="text-xs text-muted-foreground block">Saída 1</label>
              <Input
                type="time"
                value={out1}
                onChange={e => setOut1(e.target.value)}
                disabled={editingField !== "out1"}
                className="w-[110px] h-8 text-sm"
              />
              <div className="mt-1 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={editingField === "out1" ? "secondary" : "outline"}
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setEditingField(editingField === "out1" ? null : "out1")}
                >
                  {editingField === "out1" ? "Cancelar" : "Editar"}
                </Button>
                {editingField === "out1" && (
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => {
                      setEditingField(null);
                      void handleClockSave(undefined, { captureGeo: false });
                    }}
                  >
                    Salvar
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <LogIn className="h-3.5 w-3.5 text-green-600" />
            <div>
              <label className="text-xs text-muted-foreground block">Entrada 2</label>
              <Input
                type="time"
                value={in2}
                onChange={e => setIn2(e.target.value)}
                disabled={editingField !== "in2"}
                className="w-[110px] h-8 text-sm"
              />
              <div className="mt-1 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={editingField === "in2" ? "secondary" : "outline"}
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setEditingField(editingField === "in2" ? null : "in2")}
                >
                  {editingField === "in2" ? "Cancelar" : "Editar"}
                </Button>
                {editingField === "in2" && (
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => {
                      setEditingField(null);
                      void handleClockSave(undefined, { captureGeo: false });
                    }}
                  >
                    Salvar
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LogOut className="h-3.5 w-3.5 text-red-500" />
            <div>
              <label className="text-xs text-muted-foreground block">Saída 2</label>
              <Input
                type="time"
                value={out2}
                onChange={e => setOut2(e.target.value)}
                disabled={editingField !== "out2"}
                className="w-[110px] h-8 text-sm"
              />
              <div className="mt-1 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={editingField === "out2" ? "secondary" : "outline"}
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setEditingField(editingField === "out2" ? null : "out2")}
                >
                  {editingField === "out2" ? "Cancelar" : "Editar"}
                </Button>
                {editingField === "out2" && (
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => {
                      setEditingField(null);
                      void handleClockSave(undefined, { captureGeo: false });
                    }}
                  >
                    Salvar
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-amber-600" />
            <div>
              <label className="text-xs text-muted-foreground block">Hora extra (min)</label>
              <Input
                type="number"
                min={0}
                step={1}
                value={overtimeMinutes}
                onChange={e => setOvertimeMinutes(e.target.value)}
                disabled={editingField !== "overtime"}
                className="w-[140px] h-8 text-sm"
                placeholder="0"
              />
              <div className="mt-1 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={editingField === "overtime" ? "secondary" : "outline"}
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setEditingField(editingField === "overtime" ? null : "overtime")}
                >
                  {editingField === "overtime" ? "Cancelar" : "Editar"}
                </Button>
                {editingField === "overtime" && (
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => {
                      setEditingField(null);
                      void handleClockSave(undefined, { captureGeo: false });
                    }}
                  >
                    Salvar
                  </Button>
                )}
              </div>
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
