import { useState, useRef, useMemo, useCallback } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, FileText, Pen, Send, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useDailyRecords, useUsers } from "@/lib/queries";
import jsPDF from "jspdf";
import "../styles/Timesheet.css";
import React from 'react';
import { apiFetch, apiFetchBlob } from '../lib/api';
import { toast } from "@/hooks/use-toast";

interface TimesheetSignRequest { id: string; month: string; userId: string; status: string; managerSignedAt?: string; employeeSignedAt?: string; }
interface TimesheetSignedPdf { id: string; month: string; userId: string; signedAt?: string; }

const Timesheet = () => {
  const { user, isAdmin } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedUserId, setSelectedUserId] = useState<string>(user?.id || "");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const isDrawingRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

  const monthStr = format(currentMonth, "yyyy-MM");
  const targetUserId = isAdmin ? selectedUserId : user?.id || "";

  const { data: allUsers = [] } = useUsers();
  const { data: dailyRecords = [] } = useDailyRecords({ month: monthStr });

  const targetUser = isAdmin
    ? allUsers.find(u => u.id === targetUserId)
    : user;

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = useMemo(() => eachDayOfInterval({ start: monthStart, end: monthEnd }), [monthStart, monthEnd]);

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
  const totalMonthAllMins = totalMonthMins + totalMonthOvertimeMins;

  // Canvas drawing — touch events registered as non-passive to allow preventDefault
  const getCanvasCoords = (e: MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      isDrawingRef.current = true;
      const { x, y } = getCanvasCoords(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isDrawingRef.current) return;
      e.preventDefault();
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { x, y } = getCanvasCoords(e);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#000";
      ctx.lineTo(x, y);
      ctx.stroke();
      setHasSignature(true);
    };

    const onTouchEnd = () => { isDrawingRef.current = false; };

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startDraw = (e: React.MouseEvent) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    isDrawingRef.current = true;
    setIsDrawing(true);
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(
      (e.clientX - rect.left) * (canvas.width / rect.width),
      (e.clientY - rect.top) * (canvas.height / rect.height),
    );
  };

  const draw = (e: React.MouseEvent) => {
    if (!isDrawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.lineTo(
      (e.clientX - rect.left) * (canvas.width / rect.width),
      (e.clientY - rect.top) * (canvas.height / rect.height),
    );
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDraw = () => { isDrawingRef.current = false; setIsDrawing(false); };

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
    const colWidths = [20, 18, 18, 45, 18, 18, 20, 23];
    const headers = ["Dia", "Entrada 1", "Saída 1", "Almoço (Saída - Retorno)", "Entrada 2", "Saída 2", "Hora Extra", "Horas Totais"];
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
    dayData.forEach(({ day, dailyRecord, overtimeMins, workedMins }) => {
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

      const lunchBreak = firstOut !== "—" && secondIn !== "—" ? `${firstOut} - ${secondIn}` : "—";
      const heLabel = overtimeMins ? `${Math.floor(overtimeMins / 60)}h${overtimeMins % 60 > 0 ? ` ${overtimeMins % 60}m` : ""}` : "—";
      const dayTotalMins = workedMins + (overtimeMins || 0);
      const hasAny = Boolean(dailyRecord?.in1 || dailyRecord?.clockIn || dailyRecord?.out1 || dailyRecord?.in2 || dailyRecord?.out2 || dailyRecord?.clockOut || overtimeMins);
      const totalLabel = hasAny ? `${Math.floor(dayTotalMins / 60)}h${dayTotalMins % 60 > 0 ? ` ${dayTotalMins % 60}m` : ""}` : "—";

      x = margin;
      doc.text(`${dayNum} ${dayName}`, x + 1, y);
      x += colWidths[0];
      doc.text(firstIn, x + 1, y);
      x += colWidths[1];
      doc.text(firstOut, x + 1, y);
      x += colWidths[2];
      doc.text(lunchBreak, x + 1, y);
      x += colWidths[3];
      doc.text(secondIn, x + 1, y);
      x += colWidths[4];
      doc.text(secondOut, x + 1, y);
      x += colWidths[5];
      doc.text(heLabel, x + 1, y);
      x += colWidths[6];
      doc.text(totalLabel, x + 1, y);
      y += 5;
    });

    // Total
    y += 5;
    doc.line(margin, y, pageW - margin, y);
    y += 6;
    const totalH = Math.floor(totalMonthAllMins / 60);
    const totalM = totalMonthAllMins % 60;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(
      `Total: ${totalH}h ${totalM > 0 ? `${totalM}min` : ""}  |  Hora Extra: ${Math.floor(totalMonthOvertimeMins / 60)}h${
        totalMonthOvertimeMins % 60 > 0 ? ` ${totalMonthOvertimeMins % 60}min` : ""
      }`,
      margin,
      y
    );

    // Signature
    if (hasSignature && canvasRef.current) {
      y += 8;
      doc.text("Assinaturas:", margin, y);
      y += 3;
      const sigData = canvasRef.current.toDataURL("image/png");
      doc.addImage(sigData, "PNG", margin, y, 60, 20); // Assign drawn signature to Tiago Goulart
      y += 25;
      doc.line(margin, y, margin + 60, y);
      doc.line(margin + 80, y, margin + 140, y); // Add line for selected user signature
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const today = format(new Date(), "dd/MM/yyyy");
      doc.text(`Tiago Goulart (Gestor)`, margin, y + 4);
      doc.text(`${targetUser?.username || "—"} (Funcionário)`, margin + 80, y + 4); // Selected user signature remains empty
    }

    doc.save(`folha-ponto-${format(currentMonth, "yyyy-MM")}-${targetUser?.username || "user"}.pdf`);
  }, [dayData, currentMonth, targetUser, totalMonthAllMins, totalMonthOvertimeMins, hasSignature]);

  const prevMonth = () => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  // Signed & pending timesheets
  const [signedTimesheets, setSignedTimesheets] = useState<TimesheetSignedPdf[]>([]);
  const [pendingTimesheets, setPendingTimesheets] = useState<TimesheetSignRequest[]>([]);
  const [filterUserId, setFilterUserId] = useState<string>("all");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailInput, setEmailInput] = useState<string>("");
  const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);

  const RECENT_EMAILS_KEY = "ts_recent_emails";
  const getRecentEmails = (): string[] => {
    try { return JSON.parse(localStorage.getItem(RECENT_EMAILS_KEY) || "[]"); } catch { return []; }
  };
  const saveRecentEmail = (email: string) => {
    const list = [email, ...getRecentEmails().filter(e => e !== email)].slice(0, 8);
    localStorage.setItem(RECENT_EMAILS_KEY, JSON.stringify(list));
  };
  const recentEmails = getRecentEmails().filter(e => !emailInput || e.toLowerCase().includes(emailInput.toLowerCase()));

  const loadSignedData = useCallback(() => {
    const params = isAdmin && filterUserId !== "all" ? `?user_id=${filterUserId}` : "";
    apiFetch<TimesheetSignedPdf[]>(`/api/timesheets/signed-pdfs${params}`).then(setSignedTimesheets).catch(() => {});
    apiFetch<TimesheetSignRequest[]>(isAdmin ? "/api/timesheets/sign-requests" : "/api/timesheets/my-sign-requests")
      .then(r => setPendingTimesheets(r.filter(x => x.status !== "complete")))
      .catch(() => {});
  }, [isAdmin, filterUserId]);

  React.useEffect(() => { loadSignedData(); }, [loadSignedData]);

  const handleSendEmail = useCallback(async () => {
    if (!hasSignature || !canvasRef.current) {
      toast({ title: "Assine primeiro", description: "Vá para a aba 'Assinar' e desenhe sua assinatura antes de enviar.", variant: "destructive" });
      return;
    }
    if (!targetUserId) return;
    const trimmed = emailInput.trim();
    if (!trimmed) {
      toast({ title: "Informe o email", description: "Digite o email do destinatário.", variant: "destructive" });
      return;
    }
    const managerSignature = canvasRef.current.toDataURL("image/png");
    setSendingEmail(true);
    try {
      await apiFetch("/api/timesheets/sign-request", {
        method: "POST",
        body: { user_id: targetUserId, month: monthStr, manager_signature: managerSignature, override_email: trimmed },
      });
      saveRecentEmail(trimmed);
      toast({ title: "Email enviado!", description: `Link de assinatura enviado para ${trimmed}.` });
      setEmailInput("");
      loadSignedData();
    } catch (e: unknown) {
      toast({ title: "Erro ao enviar", description: e instanceof Error ? e.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setSendingEmail(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSignature, targetUserId, monthStr, emailInput, loadSignedData]);

  const handleDownload = useCallback(async (id: string) => {
    const blob = await apiFetchBlob(`/api/timesheets/signed-pdfs/${id}/download`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timesheet_${id}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);


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
                    <th>Almoço (Saída - Retorno)</th>
                    <th>Entrada 2</th>
                    <th>Saída 2</th>
                    <th>Hora Extra</th>
                    <th>Horas Totais</th>
                  </tr>
                </thead>
                <tbody>
                  {dayData.map(({ day, workedMins, overtimeMins, dailyRecord }) => {
                    const dayTotalMins = workedMins + (overtimeMins || 0);
                    const h = Math.floor(dayTotalMins / 60);
                    const m = dayTotalMins % 60;

                    const firstIn = dailyRecord?.in1 ?? dailyRecord?.clockIn ?? null;
                    const firstOut = dailyRecord?.out1 ?? null;
                    const secondIn = dailyRecord?.in2 ?? null;
                    const secondOut = dailyRecord?.out2 ?? dailyRecord?.clockOut ?? null;

                    const lunchBreak = firstOut && secondIn ? `${firstOut} - ${secondIn}` : "—";

                    const heLabel = overtimeMins ? `${Math.floor(overtimeMins / 60)}h${overtimeMins % 60 > 0 ? ` ${overtimeMins % 60}m` : ""}` : "—";

                    const hasAny = Boolean(firstIn || firstOut || secondIn || secondOut || overtimeMins);

                    return (
                      <tr key={format(day, "yyyy-MM-dd")} className={!hasAny ? "ts-table__row--empty" : ""}>
                        <td data-label="Dia">
                          {format(day, "dd")} <span className="text-muted-foreground capitalize">{format(day, "EEE", { locale: ptBR })}</span>
                        </td>
                        <td data-label="Entrada 1">{firstIn || "—"}</td>
                        <td data-label="Saída 1">{firstOut || "—"}</td>
                        <td data-label="Almoço">{lunchBreak}</td>
                        <td data-label="Entrada 2">{secondIn || "—"}</td>
                        <td data-label="Saída 2">{secondOut || "—"}</td>
                        <td data-label="Hora Extra">{heLabel}</td>
                        <td data-label="Horas">{hasAny ? `${h}h${m > 0 ? `${m}m` : ""}` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={7}>Total</td>
                    <td>
                      {Math.floor(totalMonthAllMins / 60)}h{totalMonthAllMins % 60 > 0 ? ` ${totalMonthAllMins % 60}m` : ""}
                      {totalMonthOvertimeMins > 0 && (
                        <span className="ml-2 text-[11px] text-amber-600 dark:text-amber-400">
                          Hora Extra: {Math.floor(totalMonthOvertimeMins / 60)}h{totalMonthOvertimeMins % 60 > 0 ? ` ${totalMonthOvertimeMins % 60}m` : ""}
                        </span>
                      )}
                    </td>
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

      {/* Send for signature (admin only) */}
      {isAdmin && (
        <div className="mt-4 border rounded-lg p-4 bg-card space-y-3">
          <p className="text-sm font-medium">Enviar para assinatura do funcionário</p>
          <p className="text-xs text-muted-foreground">
            Assine na aba "Assinar" acima, informe o email e envie o link para <strong>{targetUser?.username || "—"}</strong>.
          </p>
          <div className="relative">
            <input
              type="email"
              className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Email do destinatário"
              value={emailInput}
              onChange={e => { setEmailInput(e.target.value); setShowEmailSuggestions(true); }}
              onFocus={() => setShowEmailSuggestions(true)}
              onBlur={() => setTimeout(() => setShowEmailSuggestions(false), 150)}
            />
            {showEmailSuggestions && recentEmails.length > 0 && (
              <ul className="absolute z-10 w-full bg-popover border rounded-md shadow-md mt-1 max-h-40 overflow-auto">
                {recentEmails.map(e => (
                  <li
                    key={e}
                    className="px-3 py-2 text-sm cursor-pointer hover:bg-muted"
                    onMouseDown={() => { setEmailInput(e); setShowEmailSuggestions(false); }}
                  >
                    {e}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={handleSendEmail}
            disabled={sendingEmail || !targetUserId || !emailInput.trim()}
          >
            {sendingEmail ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Enviar link — {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </Button>
        </div>
      )}

      {/* Pending sign requests */}
      {pendingTimesheets.length > 0 && (
        <div className="mt-6 border rounded-lg p-4 bg-card space-y-2">
          <h2 className="font-semibold text-sm">Aguardando assinatura</h2>
          <ul className="space-y-1">
            {pendingTimesheets.map((req) => {
              const emp = allUsers.find(u => u.id === req.userId);
              return (
                <li key={req.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                  <span>{req.month} — {emp?.username ?? req.userId}</span>
                  <span className="text-xs text-amber-600 capitalize">{req.status.replace("_", " ")}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Signed PDFs */}
      <div className="mt-6 border rounded-lg p-4 bg-card space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-sm">Folhas Assinadas</h2>
          {isAdmin && (
            <Select value={filterUserId} onValueChange={v => setFilterUserId(v)}>
              <SelectTrigger className="w-44 h-8 text-xs">
                <SelectValue placeholder="Filtrar por funcionário" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {allUsers.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {signedTimesheets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma folha assinada ainda.</p>
        ) : (
          <ul className="space-y-1">
            {signedTimesheets
              .filter(pdf => filterUserId === "all" || pdf.userId === filterUserId)
              .map((pdf) => {
                const emp = allUsers.find(u => u.id === pdf.userId);
                return (
                  <li key={pdf.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                    <span>{pdf.month}{emp ? ` — ${emp.username}` : ""}</span>
                    <Button variant="ghost" size="sm" onClick={() => handleDownload(pdf.id)}>
                      <Download className="h-4 w-4 mr-1" /> Baixar
                    </Button>
                  </li>
                );
              })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Timesheet;
