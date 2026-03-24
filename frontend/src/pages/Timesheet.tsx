import { useState, useRef, useMemo, useCallback } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Download, FileText, Pen, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetchBlob } from "@/lib/api";
import { useCreateJustification, useDailyRecords, useDeleteJustification, useJustifications, useUsers } from "@/lib/queries";
import jsPDF from "jspdf";
import "./Timesheet.css";

const Timesheet = () => {
  const { user, isAdmin } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedUserId, setSelectedUserId] = useState<string>(user?.id || "");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const monthStr = format(currentMonth, "yyyy-MM");
  const targetUserId = isAdmin ? selectedUserId : user?.id || "";

  const { data: allUsers = [] } = useUsers();
  const { data: dailyRecords = [] } = useDailyRecords({ month: monthStr });

  const { data: justifications = [] } = useJustifications({
    month: monthStr,
    userId: isAdmin ? targetUserId : undefined,
  });
  const createJustification = useCreateJustification();
  const deleteJustification = useDeleteJustification();

  const [justDate, setJustDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [justText, setJustText] = useState("");
  const [justFile, setJustFile] = useState<File | null>(null);

  const targetUser = isAdmin
    ? allUsers.find(u => u.id === targetUserId)
    : user;

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const targetDailyRecords = useMemo(() => {
    return dailyRecords.filter(r => r.date.startsWith(monthStr) && r.userId === targetUserId);
  }, [dailyRecords, monthStr, targetUserId]);

  const dailyRecordMap = useMemo(() => {
    return Object.fromEntries(targetDailyRecords.map(r => [r.date, r]));
  }, [targetDailyRecords]);

  const minsBetween = useCallback((start?: string | null, end?: string | null) => {
    if (!start || !end) return 0;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const diff = (eh * 60 + em) - (sh * 60 + sm);
    return diff > 0 ? diff : 0;
  }, []);

  const calcWorkedMins = useCallback((r: {
    in1?: string | null;
    out1?: string | null;
    in2?: string | null;
    out2?: string | null;
    overtimeMinutes?: number | null;
    clockIn?: string | null;
    clockOut?: string | null;
  } | null) => {
    if (!r) return 0;

    const firstIn = r.in1 ?? r.clockIn ?? null;
    const firstOut = r.out1 ?? null;
    const secondIn = r.in2 ?? null;
    const secondOut = r.out2 ?? r.clockOut ?? null;

    // If we only have a single pair (legacy), use in1 -> out2
    if (firstIn && secondOut && !firstOut && !secondIn) {
      return minsBetween(firstIn, secondOut);
    }

    return minsBetween(firstIn, firstOut) + minsBetween(secondIn, secondOut);
  }, [minsBetween]);

  const dayData = useMemo(() => {
    return daysInMonth.map(day => {
      const dateStr = format(day, "yyyy-MM-dd");
      const dailyRecord = dailyRecordMap[dateStr] || null;
      const workedMins = calcWorkedMins(dailyRecord);
      const overtimeMins = dailyRecord?.overtimeMinutes ? Number(dailyRecord.overtimeMinutes) : 0;
      return { day, dateStr, workedMins, overtimeMins, dailyRecord };
    });
  }, [daysInMonth, dailyRecordMap, calcWorkedMins]);

  const totalMonthMins = dayData.reduce((s, d) => s + d.workedMins, 0);
  const totalMonthOvertimeMins = dayData.reduce((s, d) => s + (d.overtimeMins || 0), 0);

  // Canvas drawing
  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDraw = () => setIsDrawing(false);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const generatePDF = useCallback(() => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = 20;

    // Header
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("FOLHA DE PONTO", pageW / 2, y, { align: "center" });
    y += 10;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Funcionário: ${targetUser?.username || "—"}`, margin, y);
    y += 5;
    doc.text(`Mês: ${format(currentMonth, "MMMM yyyy", { locale: ptBR })}`, margin, y);
    y += 10;

    // Table header
    const colWidths = [12, 20, 18, 18, 18, 18, 16];
    const headers = ["Dia", "Semana", "Ent 1", "Sai 1", "Ent 2", "Sai 2", "HE (min)"];
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    let x = margin;
    headers.forEach((h, i) => {
      doc.text(h, x + 1, y);
      x += colWidths[i];
    });
    y += 2;
    doc.line(margin, y, pageW - margin, y);
    y += 4;

    // Table rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    dayData.forEach(({ day, dailyRecord, overtimeMins }) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      const dayNum = format(day, "dd");
      const dayName = format(day, "EEE", { locale: ptBR });

      const firstIn = dailyRecord?.in1 ?? dailyRecord?.clockIn ?? "—";
      const firstOut = dailyRecord?.out1 ?? "—";
      const secondIn = dailyRecord?.in2 ?? "—";
      const secondOut = dailyRecord?.out2 ?? dailyRecord?.clockOut ?? "—";

      x = margin;
      doc.text(dayNum, x + 1, y);
      x += colWidths[0];
      doc.text(dayName, x + 1, y);
      x += colWidths[1];
      doc.text(firstIn || "—", x + 1, y);
      x += colWidths[2];
      doc.text(firstOut || "—", x + 1, y);
      x += colWidths[3];
      doc.text(secondIn || "—", x + 1, y);
      x += colWidths[4];
      doc.text(secondOut || "—", x + 1, y);
      x += colWidths[5];
      doc.text(overtimeMins ? String(overtimeMins) : "—", x + 1, y);
      y += 5;
    });

    // Total
    y += 5;
    doc.line(margin, y, pageW - margin, y);
    y += 6;
    const totalH = Math.floor(totalMonthMins / 60);
    const totalM = totalMonthMins % 60;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(
      `Total: ${totalH}h ${totalM > 0 ? `${totalM}min` : ""}  |  HE: ${Math.floor(totalMonthOvertimeMins / 60)}h${
        totalMonthOvertimeMins % 60 > 0 ? ` ${totalMonthOvertimeMins % 60}min` : ""
      }`,
      margin,
      y
    );

    // Signature
    if (hasSignature && canvasRef.current) {
      y += 8;
      doc.text("Assinatura:", margin, y);
      y += 3;
      const sigData = canvasRef.current.toDataURL("image/png");
      doc.addImage(sigData, "PNG", margin, y, 60, 20);
      y += 25;
      doc.line(margin, y, margin + 60, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const today = format(new Date(), "dd/MM/yyyy");
      doc.text(`${user?.username || ""}  —  ${today}`, margin, y + 4);
    }

    doc.save(`folha-ponto-${format(currentMonth, "yyyy-MM")}-${targetUser?.username || "user"}.pdf`);
  }, [dayData, currentMonth, targetUser, totalMonthMins, totalMonthOvertimeMins, hasSignature, user?.username]);

  const prevMonth = () => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

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
    const blob = await apiFetchBlob(`/api/justifications/${id}/file`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || `atestado-${id}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:py-10">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <FileText className="h-6 w-6 text-primary" />
        Folha de Ponto
      </h1>

      {/* Month nav */}
      <div className="month-nav bg-card border border-border">
        <div className="month-nav__header">
          <Button variant="ghost" size="icon" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="month-nav__label">
            {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </span>
          <Button variant="ghost" size="icon" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {isAdmin && (
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o usuário" />
            </SelectTrigger>
            <SelectContent>
              {allUsers.map(u => (
                <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Tabs defaultValue="preview" className="mb-6">
        <TabsList className="w-full">
          <TabsTrigger value="preview" className="flex-1">Prévia</TabsTrigger>
          <TabsTrigger value="justifications" className="flex-1">
            <Upload className="h-3.5 w-3.5 mr-1" /> Justificativas
          </TabsTrigger>
          <TabsTrigger value="signature" className="flex-1">
            <Pen className="h-3.5 w-3.5 mr-1" /> Assinar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="preview">
          <div className="ts-table-wrap bg-card border border-border">
            <div className="ts-table-scroll">
              <table className="ts-table">
                <thead>
                  <tr className="bg-muted/50">
                    <th>Dia</th>
                    <th>Entrada 1</th>
                    <th>Saída 1</th>
                    <th>Entrada 2</th>
                    <th>Saída 2</th>
                    <th>HE</th>
                    <th>Horas</th>
                  </tr>
                </thead>
                <tbody>
                  {dayData.map(({ day, workedMins, overtimeMins, dailyRecord }) => {
                    const h = Math.floor(workedMins / 60);
                    const m = workedMins % 60;

                    const firstIn = dailyRecord?.in1 ?? dailyRecord?.clockIn ?? null;
                    const firstOut = dailyRecord?.out1 ?? null;
                    const secondIn = dailyRecord?.in2 ?? null;
                    const secondOut = dailyRecord?.out2 ?? dailyRecord?.clockOut ?? null;

                    const heLabel = overtimeMins ? `${Math.floor(overtimeMins / 60)}h${overtimeMins % 60 > 0 ? ` ${overtimeMins % 60}m` : ""}` : "—";

                    const hasAny = Boolean(firstIn || firstOut || secondIn || secondOut || overtimeMins);

                    return (
                      <tr key={format(day, "yyyy-MM-dd")} className={!hasAny ? "ts-table__row--empty" : ""}>
                        <td>
                          {format(day, "dd")} <span className="text-muted-foreground capitalize">{format(day, "EEE", { locale: ptBR })}</span>
                        </td>
                        <td>{firstIn || "—"}</td>
                        <td>{firstOut || "—"}</td>
                        <td>{secondIn || "—"}</td>
                        <td>{secondOut || "—"}</td>
                        <td>{heLabel}</td>
                        <td>{hasAny ? `${h}h${m > 0 ? `${m}m` : ""}` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={6}>Total</td>
                    <td>
                      {Math.floor(totalMonthMins / 60)}h{totalMonthMins % 60 > 0 ? ` ${totalMonthMins % 60}m` : ""}
                      {totalMonthOvertimeMins > 0 && (
                        <span className="ml-2 text-[11px] text-amber-600 dark:text-amber-400">
                          HE: {Math.floor(totalMonthOvertimeMins / 60)}h{totalMonthOvertimeMins % 60 > 0 ? ` ${totalMonthOvertimeMins % 60}m` : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="justifications">
          <div className="bg-card border border-border rounded-lg p-4 space-y-4">
            <div>
              <div className="text-sm font-semibold">Justificativa de falta</div>
              <div className="text-xs text-muted-foreground">
                Adicione texto e/ou anexe um atestado. O download é protegido por login.
              </div>
            </div>

            <form onSubmit={handleCreateJustification} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 border border-border rounded-lg p-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{j.date}</div>
                      {j.reasonText && (
                        <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{j.reasonText}</div>
                      )}
                      {j.originalFilename && (
                        <div className="text-xs text-muted-foreground">Arquivo: {j.originalFilename}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
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
        </TabsContent>

        <TabsContent value="signature">
          <div className="sig-section bg-card border border-border">
            <p className="sig-section__hint text-muted-foreground">Desenhe sua assinatura abaixo. Ela será incluída no PDF.</p>
            <div className="sig-canvas-wrap">
              <canvas
                ref={canvasRef}
                width={600}
                height={200}
                className="sig-canvas"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={stopDraw}
                onMouseLeave={stopDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={stopDraw}
              />
            </div>
            <div className="sig-controls">
              <Button variant="outline" size="sm" onClick={clearSignature}>
                Limpar
              </Button>
              {hasSignature && (
                <span className="sig-controls__ok">✓ Assinatura registrada</span>
              )}
            </div>
            <div className="sig-identity">
              <span className="sig-identity__name">{user?.username}</span>
              <span className="sig-identity__date">{format(new Date(), "dd/MM/yyyy")}</span>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Button onClick={generatePDF} className="w-full" size="lg">
        <FileText className="h-4 w-4 mr-2" />
        Gerar PDF da Folha de Ponto
      </Button>
    </div>
  );
};

export default Timesheet;
