import { useState, useRef, useMemo, useCallback } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, FileText, Pen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useTimeEntries, useProjects, useLocations, useUsers, useDailyRecords } from "@/lib/queries";
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

  const { data: entries = [] } = useTimeEntries({ month: monthStr });
  const { data: projects = [] } = useProjects();
  const { data: locations = [] } = useLocations();
  const { data: allUsers = [] } = useUsers();
  const { data: dailyRecords = [] } = useDailyRecords({ month: monthStr });

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));
  const locationMap = Object.fromEntries(locations.map(l => [l.id, l]));

  const targetUser = isAdmin
    ? allUsers.find(u => u.id === targetUserId)
    : user;

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const monthEntries = useMemo(() => {
    return entries.filter(e => e.date.startsWith(monthStr) && e.userId === targetUserId);
  }, [entries, monthStr, targetUserId]);

  const targetDailyRecords = useMemo(() => {
    return dailyRecords.filter(r => r.date.startsWith(monthStr) && r.userId === targetUserId);
  }, [dailyRecords, monthStr, targetUserId]);

  const dailyRecordMap = useMemo(() => {
    return Object.fromEntries(targetDailyRecords.map(r => [r.date, r]));
  }, [targetDailyRecords]);

  const dayData = useMemo(() => {
    return daysInMonth.map(day => {
      const dateStr = format(day, "yyyy-MM-dd");
      const dayEntries = monthEntries.filter(e => e.date === dateStr);
      // Only count work entries (exclude breaks) for total work minutes
      const workEntries = dayEntries.filter(e => e.entryType !== "break");
      const totalMins = workEntries.reduce((sum, e) => {
        const [sh, sm] = e.startTime.split(":").map(Number);
        const [eh, em] = e.endTime.split(":").map(Number);
        return sum + (eh * 60 + em) - (sh * 60 + sm);
      }, 0);
      const dailyRecord = dailyRecordMap[dateStr] || null;
      return { day, dateStr, entries: dayEntries, totalMins, dailyRecord };
    });
  }, [daysInMonth, monthEntries, dailyRecordMap]);

  const totalMonthMins = dayData.reduce((s, d) => s + d.totalMins, 0);

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
    doc.text(`Funcionário: ${targetUser?.name || "—"}`, margin, y);
    y += 5;
    doc.text(`Mês: ${format(currentMonth, "MMMM yyyy", { locale: ptBR })}`, margin, y);
    y += 10;

    // Table header
    const colWidths = [18, 35, 22, 22, 50];
    const headers = ["Dia", "Dia Semana", "Entrada", "Saída", "Projeto"];
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
    dayData.forEach(({ day, entries: dayEntries, dailyRecord }) => {
      if (y > 260) {
        doc.addPage();
        y = 20;
      }
      const dayNum = format(day, "dd");
      const dayName = format(day, "EEE", { locale: ptBR });

      // Show clock-in/out if available
      if (dailyRecord && (dailyRecord.clockIn || dailyRecord.clockOut)) {
        x = margin;
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7);
        doc.text(dayNum, x + 1, y);
        x += colWidths[0];
        doc.text(dayName, x + 1, y);
        x += colWidths[1];
        doc.text(dailyRecord.clockIn || "—", x + 1, y);
        x += colWidths[2];
        doc.text(dailyRecord.clockOut || "—", x + 1, y);
        x += colWidths[3];
        doc.text("[Registro do dia]", x + 1, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        y += 5;
      }

      if (dayEntries.length === 0 && !(dailyRecord && (dailyRecord.clockIn || dailyRecord.clockOut))) {
        x = margin;
        doc.text(dayNum, x + 1, y);
        x += colWidths[0];
        doc.text(dayName, x + 1, y);
        x += colWidths[1];
        doc.text("—", x + 1, y);
        y += 5;
      } else {
        dayEntries.forEach((entry, idx) => {
          x = margin;
          const showDay = idx === 0 && !(dailyRecord && (dailyRecord.clockIn || dailyRecord.clockOut));
          doc.text(showDay ? dayNum : "", x + 1, y);
          x += colWidths[0];
          doc.text(showDay ? dayName : "", x + 1, y);
          x += colWidths[1];
          doc.text(entry.startTime, x + 1, y);
          x += colWidths[2];
          doc.text(entry.endTime, x + 1, y);
          x += colWidths[3];
          const isBrk = entry.entryType === "break";
          const projLabel = isBrk
            ? "Intervalo"
            : `${projectMap[entry.projectId]?.name || "—"}${entry.isOvertime ? " (HE)" : ""}`;
          doc.text(projLabel.substring(0, 28), x + 1, y);
          y += 5;
        });
      }
    });

    // Total
    y += 5;
    doc.line(margin, y, pageW - margin, y);
    y += 6;
    const totalH = Math.floor(totalMonthMins / 60);
    const totalM = totalMonthMins % 60;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`Total: ${totalH}h ${totalM > 0 ? `${totalM}min` : ""}`, margin, y);

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
      doc.text(`${user?.name || ""}  —  ${today}`, margin, y + 4);
    }

    doc.save(`folha-ponto-${format(currentMonth, "yyyy-MM")}-${targetUser?.name || "user"}.pdf`);
  }, [dayData, currentMonth, targetUser, totalMonthMins, hasSignature, projectMap]);

  const prevMonth = () => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

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
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Tabs defaultValue="preview" className="mb-6">
        <TabsList className="w-full">
          <TabsTrigger value="preview" className="flex-1">Prévia</TabsTrigger>
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
                    <th>Entrada</th>
                    <th>Saída</th>
                    <th>Projeto</th>
                    <th>Horas</th>
                  </tr>
                </thead>
                <tbody>
                  {dayData.map(({ day, entries: dayEntries, totalMins, dailyRecord }) => {
                    const h = Math.floor(totalMins / 60);
                    const m = totalMins % 60;
                    const rows: React.ReactNode[] = [];

                    // Clock-in/out row if available
                    if (dailyRecord && (dailyRecord.clockIn || dailyRecord.clockOut)) {
                      rows.push(
                        <tr key={`clock-${format(day, "dd")}`} className="text-xs bg-blue-50/50 dark:bg-blue-950/20">
                          <td>
                            {format(day, "dd")} <span className="text-muted-foreground capitalize">{format(day, "EEE", { locale: ptBR })}</span>
                          </td>
                          <td className="text-blue-600 dark:text-blue-400">{dailyRecord.clockIn || "—"}</td>
                          <td className="text-blue-600 dark:text-blue-400">{dailyRecord.clockOut || "—"}</td>
                          <td className="text-blue-600 dark:text-blue-400 italic text-[11px]">Registro do dia</td>
                          <td></td>
                        </tr>
                      );
                    }

                    if (dayEntries.length === 0 && rows.length === 0) {
                      rows.push(
                        <tr key={format(day, "dd")} className="ts-table__row--empty">
                          <td>
                            {format(day, "dd")} <span className="text-muted-foreground capitalize">{format(day, "EEE", { locale: ptBR })}</span>
                          </td>
                          <td>—</td>
                          <td>—</td>
                          <td>—</td>
                          <td>—</td>
                        </tr>
                      );
                    } else {
                      dayEntries.forEach((entry, idx) => {
                        const isBrk = entry.entryType === "break";
                        rows.push(
                          <tr key={entry.id} className={isBrk ? "bg-orange-50/50 dark:bg-orange-950/20" : ""}>
                            <td>
                              {idx === 0 && rows.length <= (dailyRecord && (dailyRecord.clockIn || dailyRecord.clockOut) ? 1 : 0) && (
                                <>{format(day, "dd")} <span className="text-muted-foreground capitalize">{format(day, "EEE", { locale: ptBR })}</span></>
                              )}
                            </td>
                            <td>{entry.startTime}</td>
                            <td>{entry.endTime}</td>
                            <td>
                              {isBrk ? (
                                <span className="text-orange-500 italic">Intervalo</span>
                              ) : (
                                <>
                                  {projectMap[entry.projectId]?.name || "—"}
                                  {entry.isOvertime && (
                                    <span className="ml-1 text-[10px] font-medium text-amber-600 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-400 px-1 py-0.5 rounded">HE</span>
                                  )}
                                </>
                              )}
                            </td>
                            <td>{idx === 0 ? `${h}h${m > 0 ? `${m}m` : ""}` : ""}</td>
                          </tr>
                        );
                      });
                    }
                    return rows;
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>Total</td>
                    <td>{Math.floor(totalMonthMins / 60)}h{totalMonthMins % 60 > 0 ? ` ${totalMonthMins % 60}m` : ""}</td>
                  </tr>
                </tfoot>
              </table>
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
              <span className="sig-identity__name">{user?.name}</span>
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
