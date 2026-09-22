import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTimeEntries, useProjects, useUsers } from "@/lib/queries";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { BarChart3, Clock, FolderOpen, DollarSign, Coffee, Zap, Users, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import jsPDF from "jspdf";
import "../styles/Dashboard.css";

const Dashboard = () => {
  const { isAdmin, user } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [highlightedProject, setHighlightedProject] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: entries = [] } = useTimeEntries({});
  const { data: projects = [] } = useProjects();
  const { data: allUsers = [] } = useUsers();

  const projectMap = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p])),
    [projects]
  );
  const userMap = useMemo(
    () => Object.fromEntries(allUsers.map((u) => [u.id, u])),
    [allUsers]
  );

  const filteredEntries = useMemo(() => {
    let filtered = entries;
    if (!isAdmin) {
      filtered = filtered.filter((e) => e.userId === user?.id);
    } else if (selectedUserId !== "all") {
      filtered = filtered.filter((e) => e.userId === selectedUserId);
    }
    if (dateFrom) filtered = filtered.filter((e) => e.date >= dateFrom);
    if (dateTo) filtered = filtered.filter((e) => e.date <= dateTo);
    return filtered;
  }, [entries, isAdmin, user, selectedUserId, dateFrom, dateTo]);

  const calcMins = (e: { startTime: string; endTime: string }) => {
    const [sh, sm] = e.startTime.split(":").map(Number);
    const [eh, em] = e.endTime.split(":").map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
  };

  const workEntries = useMemo(() => filteredEntries.filter((e) => e.entryType !== "break"), [filteredEntries]);
  const breakEntries = useMemo(() => filteredEntries.filter((e) => e.entryType === "break"), [filteredEntries]);

  const hoursPerProject = useMemo(() => {
    const map = new Map<string, number>();
    workEntries.forEach((e) => {
      map.set(e.projectId, (map.get(e.projectId) || 0) + calcMins(e));
    });
    return Array.from(map.entries())
      .map(([id, mins]) => ({
        name: projectMap[id]?.name || "Desconhecido",
        hours: Math.round((mins / 60) * 100) / 100,
        color: projectMap[id]?.color || "#64748b",
      }))
      .sort((a, b) => b.hours - a.hours);
  }, [workEntries, projectMap]);

  const pieData = useMemo(() => {
    const total = hoursPerProject.reduce((s, p) => s + p.hours, 0);
    if (total === 0) return [];
    const THRESHOLD = 0.05;
    const main: { name: string; hours: number; color: string }[] = [];
    let otherHours = 0;
    hoursPerProject.forEach((p) => {
      if (p.hours / total >= THRESHOLD) {
        main.push(p);
      } else {
        otherHours += p.hours;
      }
    });
    if (otherHours > 0) {
      main.push({ name: "Outros", hours: Math.round(otherHours * 100) / 100, color: "#94a3b8" });
    }
    return main;
  }, [hoursPerProject]);

  const costPerProject = useMemo(() => {
    if (!isAdmin) return [];
    const map = new Map<string, { normal: number; overtime: number }>();
    workEntries.forEach((e) => {
      const u = userMap[e.userId || ""];
      const hours = calcMins(e) / 60;
      const projectId = e.projectId;
      const prev = map.get(projectId) || { normal: 0, overtime: 0 };
      const rate = u?.hourlyRate || 0;
      if (e.isOvertime) prev.overtime += hours * rate;
      else prev.normal += hours * rate;
      map.set(projectId, prev);
    });
    return Array.from(map.entries())
      .map(([id, { normal, overtime }]) => ({
        name: projectMap[id]?.name || "Desconhecido",
        cost: Math.round((normal + overtime) * 100) / 100,
        normalCost: Math.round(normal * 100) / 100,
        overtimeCost: Math.round(overtime * 100) / 100,
        color: projectMap[id]?.color || "#64748b",
      }))
      .filter((c) => c.cost > 0)
      .sort((a, b) => b.cost - a.cost);
  }, [workEntries, isAdmin, userMap, projectMap]);

  // Gráfico 3: horas normais vs extras por usuário
  const normalVsOvertimePerUser = useMemo(() => {
    if (!isAdmin) return [];
    const map = new Map<string, { normal: number; overtime: number }>();
    workEntries.forEach((e) => {
      const key = e.userId || "unknown";
      const prev = map.get(key) || { normal: 0, overtime: 0 };
      const mins = calcMins(e);
      if (e.isOvertime) prev.overtime += mins;
      else prev.normal += mins;
      map.set(key, prev);
    });
    return Array.from(map.entries())
      .map(([id, { normal, overtime }]) => ({
        id,
        name: userMap[id]?.username || "Desconhecido",
        normal: Math.round((normal / 60) * 100) / 100,
        overtime: Math.round((overtime / 60) * 100) / 100,
      }))
      .filter((d) => d.normal + d.overtime > 0)
      .sort((a, b) => b.normal + b.overtime - (a.normal + a.overtime));
  }, [workEntries, isAdmin, userMap]);

  // Gráfico 7: custo normal vs hora extra por projeto
  const normalVsOvertimeCostPerProject = useMemo(() => {
    if (!isAdmin) return [];
    return costPerProject.map((c) => {
      const proj = projects.find((p) => p.name === c.name);
      return {
        id: proj?.id || c.name,
        name: c.name,
        normal: c.normalCost,
        overtime: c.overtimeCost,
        color: c.color,
      };
    });
  }, [costPerProject, isAdmin, projects]);

  const totalMinutes = workEntries.reduce((sum, e) => sum + calcMins(e), 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalMins = totalMinutes % 60;
  const totalCost = isAdmin ? costPerProject.reduce((s, c) => s + c.cost, 0) : 0;
  const breakTotalMins = breakEntries.reduce((sum, e) => sum + calcMins(e), 0);
  const overtimeMins = workEntries.filter((e) => e.isOvertime).reduce((sum, e) => sum + calcMins(e), 0);
  const totalOvertimeCost = isAdmin ? costPerProject.reduce((s, c) => s + (c.overtimeCost || 0), 0) : 0;

  const MONTHS_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  const exportReport = (range: "month" | "3months" | "6months" | "year") => {
    const now = new Date();
    let from: Date;
    let to: Date = new Date(now.getFullYear(), now.getMonth() + 1, 0); // end of current month

    if (range === "month") {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (range === "3months") {
      from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    } else if (range === "6months") {
      from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    } else {
      from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    }

    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);

    // Filter entries for the chosen range (all users, since this is admin)
    const rangeEntries = entries.filter((e) => e.date >= fromStr && e.date <= toStr);
    const rangeWorkEntries = rangeEntries.filter((e) => e.entryType !== "break");

    // Recompute hoursPerProject for range
    const projMap = new Map<string, number>();
    rangeWorkEntries.forEach((e) => {
      projMap.set(e.projectId, (projMap.get(e.projectId) || 0) + calcMins(e));
    });
    const rangeHoursPerProject = Array.from(projMap.entries())
      .map(([id, mins]) => ({
        name: projectMap[id]?.name || "Desconhecido",
        hours: Math.round((mins / 60) * 100) / 100,
        color: projectMap[id]?.color || "#64748b",
      }))
      .sort((a, b) => b.hours - a.hours);

    // Recompute pie data for range
    const totalPie = rangeHoursPerProject.reduce((s, p) => s + p.hours, 0);
    const THRESHOLD = 0.05;
    const rangePieMain: { name: string; hours: number; color: string }[] = [];
    let otherHours = 0;
    rangeHoursPerProject.forEach((p) => {
      if (totalPie > 0 && p.hours / totalPie >= THRESHOLD) rangePieMain.push(p);
      else otherHours += p.hours;
    });
    if (otherHours > 0) rangePieMain.push({ name: "Outros", hours: Math.round(otherHours * 100) / 100, color: "#94a3b8" });

    // Recompute user ranking for range
    const userHoursMap = new Map<string, { normal: number; overtime: number }>();
    rangeWorkEntries.forEach((e) => {
      const key = e.userId || "unknown";
      const prev = userHoursMap.get(key) || { normal: 0, overtime: 0 };
      const mins = calcMins(e);
      if (e.isOvertime) prev.overtime += mins;
      else prev.normal += mins;
      userHoursMap.set(key, prev);
    });
    const rangeUserRanking = Array.from(userHoursMap.entries())
      .map(([id, { normal, overtime }]) => ({
        name: userMap[id]?.username || "Desconhecido",
        normal: Math.round((normal / 60) * 100) / 100,
        overtime: Math.round((overtime / 60) * 100) / 100,
      }))
      .filter((d) => d.normal + d.overtime > 0)
      .sort((a, b) => b.normal + b.overtime - (a.normal + a.overtime));

    // Build the date label
    const fromMonthLabel = `${MONTHS_PT[from.getMonth()]} ${from.getFullYear()}`;
    const toMonthLabel = `${MONTHS_PT[to.getMonth()]} ${to.getFullYear()}`;
    const periodLabel = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()
      ? fromMonthLabel
      : `${fromMonthLabel} — ${toMonthLabel}`;

    // Generate PDF
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = 20;

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("RELATÓRIO DO DASHBOARD", pageW / 2, y, { align: "center" });
    y += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Período: ${periodLabel}`, pageW / 2, y, { align: "center" });
    y += 5;
    doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")}`, pageW / 2, y, { align: "center" });
    y += 10;

    // Section: Resumo
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Resumo Geral", margin, y);
    y += 1;
    doc.setDrawColor(180, 180, 180);
    doc.line(margin, y, pageW - margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const totalRangeMins = rangeWorkEntries.reduce((s, e) => s + calcMins(e), 0);
    const rh = Math.floor(totalRangeMins / 60);
    const rm = totalRangeMins % 60;
    const overtimeRangeMins = rangeWorkEntries.filter((e) => e.isOvertime).reduce((s, e) => s + calcMins(e), 0);
    const oh = Math.floor(overtimeRangeMins / 60);
    const om = overtimeRangeMins % 60;
    doc.text(`Total de horas: ${rh}h${rm > 0 ? ` ${rm}m` : ""}`, margin, y);
    y += 5;
    doc.text(`Horas extras: ${oh}h${om > 0 ? ` ${om}m` : ""}`, margin, y);
    y += 5;
    doc.text(`Projetos: ${rangeHoursPerProject.length}   |   Registros: ${rangeWorkEntries.length}`, margin, y);
    y += 10;

    // Section: Distribuição por Projeto (Pie)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Distribuição de Horas por Projeto", margin, y);
    y += 1;
    doc.line(margin, y, pageW - margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    if (rangePieMain.length === 0) {
      doc.text("Nenhum dado no período.", margin, y);
      y += 8;
    } else {
      const pieTotalH = rangePieMain.reduce((s, p) => s + p.hours, 0);
      // Draw simple legend-style pie table
      const col1 = margin;
      const col2 = margin + 6;
      const col3 = pageW - margin - 40;
      const col4 = pageW - margin - 15;
      doc.setFont("helvetica", "bold");
      doc.text("Projeto", col2, y);
      doc.text("Horas", col3, y, { align: "right" });
      doc.text("%", col4, y, { align: "right" });
      y += 2;
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageW - margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      for (const p of rangePieMain) {
        if (y > 270) { doc.addPage(); y = 20; }
        const pct = pieTotalH > 0 ? (p.hours / pieTotalH) * 100 : 0;
        // Color dot via hex
        const hex = p.color.replace("#", "");
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        doc.setFillColor(r, g, b);
        doc.circle(col1 + 1.5, y - 1.5, 1.5, "F");
        doc.text(p.name, col2, y);
        doc.text(`${p.hours}h`, col3, y, { align: "right" });
        doc.text(`${pct.toFixed(1)}%`, col4, y, { align: "right" });
        y += 5;
      }
      doc.setFont("helvetica", "bold");
      doc.line(margin, y, pageW - margin, y);
      y += 4;
      doc.text("Total", col2, y);
      doc.text(`${pieTotalH.toFixed(2)}h`, col3, y, { align: "right" });
      doc.text("100%", col4, y, { align: "right" });
      y += 10;
    }

    // Section: Ranking de Horas por Projeto
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Ranking — Horas por Projeto", margin, y);
    y += 1;
    doc.line(margin, y, pageW - margin, y);
    y += 6;
    doc.setFontSize(9);

    if (rangeHoursPerProject.length === 0) {
      doc.setFont("helvetica", "normal");
      doc.text("Nenhum dado no período.", margin, y);
      y += 8;
    } else {
      const hpTotal = rangeHoursPerProject.reduce((s, p) => s + p.hours, 0);
      const c1 = margin, c2 = margin + 8, c3 = pageW - margin - 30, c4 = pageW - margin;
      doc.text("#", c1, y);
      doc.text("Projeto", c2, y);
      doc.text("Horas", c3, y, { align: "right" });
      doc.text("%", c4, y, { align: "right" });
      y += 2;
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageW - margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      rangeHoursPerProject.forEach((p, i) => {
        if (y > 270) { doc.addPage(); y = 20; }
        const pct = hpTotal > 0 ? (p.hours / hpTotal) * 100 : 0;
        doc.text(String(i + 1), c1, y);
        doc.text(p.name, c2, y);
        doc.text(`${p.hours}h`, c3, y, { align: "right" });
        doc.text(`${pct.toFixed(1)}%`, c4, y, { align: "right" });
        y += 5;
      });
      doc.setFont("helvetica", "bold");
      doc.line(margin, y, pageW - margin, y);
      y += 4;
      doc.text("Total", c2, y);
      doc.text(`${hpTotal.toFixed(2)}h`, c3, y, { align: "right" });
      doc.text("100%", c4, y, { align: "right" });
      y += 10;
    }

    // Section: Ranking de Horas por Usuário
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Ranking — Horas por Usuário", margin, y);
    y += 1;
    doc.line(margin, y, pageW - margin, y);
    y += 6;
    doc.setFontSize(9);

    if (rangeUserRanking.length === 0) {
      doc.setFont("helvetica", "normal");
      doc.text("Nenhum dado no período.", margin, y);
      y += 8;
    } else {
      const u1 = margin, u2 = margin + 8, u3 = pageW - margin - 50, u4 = pageW - margin - 25, u5 = pageW - margin;
      doc.text("#", u1, y);
      doc.text("Usuário", u2, y);
      doc.text("Normal", u3, y, { align: "right" });
      doc.text("Extra", u4, y, { align: "right" });
      doc.text("Total", u5, y, { align: "right" });
      y += 2;
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageW - margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      const uGrandTotal = rangeUserRanking.reduce((s, u) => s + u.normal + u.overtime, 0);
      rangeUserRanking.forEach((u, i) => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(String(i + 1), u1, y);
        doc.text(u.name, u2, y);
        doc.text(`${u.normal}h`, u3, y, { align: "right" });
        doc.text(u.overtime > 0 ? `${u.overtime}h` : "—", u4, y, { align: "right" });
        doc.text(`${(u.normal + u.overtime).toFixed(2)}h`, u5, y, { align: "right" });
        y += 5;
      });
      doc.setFont("helvetica", "bold");
      doc.line(margin, y, pageW - margin, y);
      y += 4;
      const totalNormal = rangeUserRanking.reduce((s, u) => s + u.normal, 0);
      const totalOT = rangeUserRanking.reduce((s, u) => s + u.overtime, 0);
      doc.text("Total", u2, y);
      doc.text(`${totalNormal.toFixed(2)}h`, u3, y, { align: "right" });
      doc.text(`${totalOT.toFixed(2)}h`, u4, y, { align: "right" });
      doc.text(`${uGrandTotal.toFixed(2)}h`, u5, y, { align: "right" });
    }

    const rangeLabel = range === "month" ? "1 mês" : range === "3months" ? "3 meses" : range === "6months" ? "6 meses" : "12 meses";
    const exportDate = now.toLocaleDateString("pt-BR").replace(/\//g, "-");
    doc.save(`Relatório de Horas por Projetos - ${rangeLabel} - ${exportDate}.pdf`);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 md:py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" />
                Exportar Relatório
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportReport("month")}>Mês atual</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportReport("3months")}>Últimos 3 meses</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportReport("6months")}>Últimos 6 meses</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportReport("year")}>Último 1 ano</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          {isAdmin && (
            <div className="w-full sm:w-auto sm:min-w-[180px]">
              <label className="text-xs text-muted-foreground mb-1 block">Usuário</label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os usuários</SelectItem>
                  {allUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <label className="text-xs text-muted-foreground mb-1 block">De</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full" />
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-xs text-muted-foreground mb-1 block">Até</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full" />
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className={`db-cards ${isAdmin ? "db-cards--admin" : "db-cards--user"}`}>
        <div className="db-card bg-card border border-border">
          <Clock className="db-card__icon text-primary" />
          <div className="db-card__body">
            <div className="db-card__value">{totalHours}h{totalMins > 0 ? ` ${totalMins}m` : ""}</div>
            <div className="db-card__label text-muted-foreground">Total de horas</div>
          </div>
        </div>
        {overtimeMins > 0 ? (
          <div className="db-card bg-card border border-border">
            <Zap className="db-card__icon text-amber-500" />
            <div className="db-card__body">
              <div className="db-card__value">{Math.floor(overtimeMins / 60)}h{overtimeMins % 60 > 0 ? ` ${overtimeMins % 60}m` : ""}</div>
              <div className="db-card__label text-muted-foreground">Horas extras</div>
            </div>
          </div>
        ) : null}
        {breakTotalMins > 0 ? (
          <div className="db-card bg-card border border-border">
            <Coffee className="db-card__icon text-orange-500" />
            <div className="db-card__body">
              <div className="db-card__value">{Math.floor(breakTotalMins / 60)}h{breakTotalMins % 60 > 0 ? ` ${breakTotalMins % 60}m` : ""}</div>
              <div className="db-card__label text-muted-foreground">Intervalos</div>
            </div>
          </div>
        ) : null}
        <div className="db-card bg-card border border-border">
          <FolderOpen className="db-card__icon text-primary" />
          <div className="db-card__body">
            <div className="db-card__value">{hoursPerProject.length}</div>
            <div className="db-card__label text-muted-foreground">Projetos ativos</div>
          </div>
        </div>
        <div className="db-card bg-card border border-border">
          <BarChart3 className="db-card__icon text-primary" />
          <div className="db-card__body">
            <div className="db-card__value">{filteredEntries.length}</div>
            <div className="db-card__label text-muted-foreground">Registros</div>
          </div>
        </div>
        {isAdmin ? (
          <div className="db-card bg-card border border-border">
            <DollarSign className="db-card__icon text-primary" />
            <div className="db-card__body">
              <div className="db-card__value--money">R$ {totalCost.toFixed(2)}</div>
              <div className="db-card__label text-muted-foreground">
                Custo total{totalOvertimeCost > 0 ? (<span className="text-amber-500"> (HE: R$ {totalOvertimeCost.toFixed(2)})</span>) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <Tabs defaultValue="hours">
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="hours">Horas</TabsTrigger>
          {isAdmin ? <TabsTrigger value="cost">Custo por Projeto</TabsTrigger> : null}
        </TabsList>

        {/* Aba Horas */}
        <TabsContent value="hours">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-4">Horas por Projeto</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={hoursPerProject} layout="vertical" margin={{ left: 10 }}>
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(val: number) => [`${val}h`, "Horas"]} />
                  <Bar dataKey="hours" radius={[0, 6, 6, 0]}>
                    {hoursPerProject.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-card border border-border rounded-lg p-4 overflow-hidden">
              <h3 className="text-sm font-semibold mb-4">Distribuição</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="hours"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    innerRadius={35}
                    label={({ name, percent }) =>
                      percent >= 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ""
                    }
                    labelLine={false}
                    fontSize={11}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: number) => [`${val}h`, "Horas"]} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {isAdmin && normalVsOvertimePerUser.length > 0 ? (
              <div className="bg-card border border-border rounded-lg p-4 md:col-span-2">
                <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" /> Horas Normais vs Extras por Usuário
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Clique em um usuário para filtrar. Clique novamente para desfiltrar.
                  {selectedUserId !== "all" && (
                    <button
                      className="ml-2 text-primary underline"
                      onClick={() => setSelectedUserId("all")}
                    >
                      Limpar filtro
                    </button>
                  )}
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={normalVsOvertimePerUser}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} unit="h" />
                    <Tooltip formatter={(val: number) => [`${val}h`]} />
                    <Legend />
                    <Bar
                      dataKey="normal"
                      name="Normal"
                      stackId="a"
                      fill="#0f766e"
                      style={{ cursor: "pointer" }}
                      onClick={(data) => setSelectedUserId((prev) => prev === data.id ? "all" : data.id)}
                    >
                      {normalVsOvertimePerUser.map((entry) => (
                        <Cell
                          key={entry.id}
                          fill="#0f766e"
                          opacity={selectedUserId === "all" || selectedUserId === entry.id ? 1 : 0.35}
                        />
                      ))}
                    </Bar>
                    <Bar
                      dataKey="overtime"
                      name="Hora Extra"
                      stackId="a"
                      fill="#f59e0b"
                      radius={[6, 6, 0, 0]}
                      style={{ cursor: "pointer" }}
                      onClick={(data) => setSelectedUserId((prev) => prev === data.id ? "all" : data.id)}
                    >
                      {normalVsOvertimePerUser.map((entry) => (
                        <Cell
                          key={entry.id}
                          fill="#f59e0b"
                          opacity={selectedUserId === "all" || selectedUserId === entry.id ? 1 : 0.35}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : null}

            {/* Ranking por Projeto */}
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-primary" /> Ranking — Horas por Projeto
              </h3>
              {hoursPerProject.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhum dado no período.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-xs">
                      <th className="text-left pb-2 font-medium">#</th>
                      <th className="text-left pb-2 font-medium">Projeto</th>
                      <th className="text-right pb-2 font-medium">Horas</th>
                      <th className="text-right pb-2 font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hoursPerProject.map((p, i) => {
                      const total = hoursPerProject.reduce((s, x) => s + x.hours, 0);
                      const pct = total > 0 ? (p.hours / total) * 100 : 0;
                      return (
                        <tr key={p.name} className="border-b border-border/40 last:border-0">
                          <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                          <td className="py-2">
                            <div className="flex items-center gap-2">
                              <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.color }} />
                              <span className="truncate max-w-[120px]">{p.name}</span>
                            </div>
                            <div className="mt-1 h-1 rounded-full bg-border overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: p.color }} />
                            </div>
                          </td>
                          <td className="py-2 text-right font-medium tabular-nums">{p.hours}h</td>
                          <td className="py-2 text-right text-muted-foreground tabular-nums">{pct.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border text-xs font-semibold">
                      <td colSpan={2} className="pt-2">Total</td>
                      <td className="pt-2 text-right tabular-nums">
                        {hoursPerProject.reduce((s, x) => s + x.hours, 0).toFixed(2)}h
                      </td>
                      <td className="pt-2 text-right text-muted-foreground">100%</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* Ranking por Usuário (admin only) */}
            {isAdmin ? (
              <div className="bg-card border border-border rounded-lg p-4">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" /> Ranking — Horas por Usuário
                </h3>
                {normalVsOvertimePerUser.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Nenhum dado no período.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground text-xs">
                        <th className="text-left pb-2 font-medium">#</th>
                        <th className="text-left pb-2 font-medium">Usuário</th>
                        <th className="text-right pb-2 font-medium">Normal</th>
                        <th className="text-right pb-2 font-medium">Extra</th>
                        <th className="text-right pb-2 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {normalVsOvertimePerUser.map((u, i) => {
                        const total = u.normal + u.overtime;
                        const grandTotal = normalVsOvertimePerUser.reduce((s, x) => s + x.normal + x.overtime, 0);
                        const pct = grandTotal > 0 ? (total / grandTotal) * 100 : 0;
                        const color = ["#0f766e","#2563eb","#9333ea","#dc2626","#ea580c","#ca8a04","#16a34a","#64748b"][i % 8];
                        return (
                          <tr key={u.id} className="border-b border-border/40 last:border-0">
                            <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                            <td className="py-2">
                              <div className="flex items-center gap-2">
                                <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                                <span className="truncate max-w-[100px]">{u.name}</span>
                              </div>
                              <div className="mt-1 h-1 rounded-full bg-border overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                              </div>
                            </td>
                            <td className="py-2 text-right tabular-nums">{u.normal}h</td>
                            <td className="py-2 text-right tabular-nums text-amber-500">{u.overtime > 0 ? `${u.overtime}h` : "—"}</td>
                            <td className="py-2 text-right font-medium tabular-nums">{total.toFixed(2)}h</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border text-xs font-semibold">
                        <td colSpan={2} className="pt-2">Total</td>
                        <td className="pt-2 text-right tabular-nums">
                          {normalVsOvertimePerUser.reduce((s, x) => s + x.normal, 0).toFixed(2)}h
                        </td>
                        <td className="pt-2 text-right tabular-nums text-amber-500">
                          {normalVsOvertimePerUser.reduce((s, x) => s + x.overtime, 0).toFixed(2)}h
                        </td>
                        <td className="pt-2 text-right tabular-nums">
                          {normalVsOvertimePerUser.reduce((s, x) => s + x.normal + x.overtime, 0).toFixed(2)}h
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            ) : null}
          </div>
        </TabsContent>
        {isAdmin ? (
          <TabsContent value="cost">
            <div className="bg-card border border-border rounded-lg p-4">
              {normalVsOvertimeCostPerProject.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  Configure o valor/hora dos usuários em "Gerenciar Usuários" para ver os custos.
                </div>
              ) : (
                <>
                  <h3 className="text-sm font-semibold mb-1">Custo Normal vs Hora Extra por Projeto (R$)</h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    Clique em um projeto para destacá-lo. Clique novamente para limpar.
                    {highlightedProject !== null && (
                      <button
                        className="ml-2 text-primary underline"
                        onClick={() => setHighlightedProject(null)}
                      >
                        Limpar
                      </button>
                    )}
                  </p>
                  <ResponsiveContainer width="100%" height={Math.max(200, normalVsOvertimeCostPerProject.length * 44)}>
                    <BarChart data={normalVsOvertimeCostPerProject} layout="vertical" margin={{ left: 10 }}>
                      <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `R$${v}`} />
                      <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(val: number) => [`R$ ${val.toFixed(2)}`]} />
                      <Legend />
                      <Bar
                        dataKey="normal"
                        name="Normal"
                        stackId="a"
                        style={{ cursor: "pointer" }}
                        onClick={(data) => setHighlightedProject((prev) => prev === data.id ? null : data.id)}
                      >
                        {normalVsOvertimeCostPerProject.map((entry) => (
                          <Cell
                            key={entry.id}
                            fill="#0f766e"
                            opacity={highlightedProject === null || highlightedProject === entry.id ? 1 : 0.35}
                          />
                        ))}
                      </Bar>
                      <Bar
                        dataKey="overtime"
                        name="Hora Extra"
                        stackId="a"
                        radius={[0, 6, 6, 0]}
                        style={{ cursor: "pointer" }}
                        onClick={(data) => setHighlightedProject((prev) => prev === data.id ? null : data.id)}
                      >
                        {normalVsOvertimeCostPerProject.map((entry) => (
                          <Cell
                            key={entry.id}
                            fill="#f59e0b"
                            opacity={highlightedProject === null || highlightedProject === entry.id ? 1 : 0.35}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Cost breakdown table */}
                  <div className="mt-4 border-t border-border pt-4">
                    <div className="max-h-[420px] overflow-y-auto overflow-x-auto pr-2">
                      <table className="breakdown-table">
                        <thead>
                          <tr>
                            <th>Projeto</th>
                            <th>Custo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {costPerProject.map((c) => {
                            const proj = projects.find((p) => p.name === c.name);
                            const isActive = highlightedProject === null || highlightedProject === proj?.id;
                            return (
                              <tr
                                key={c.name}
                                style={{ opacity: isActive ? 1 : 0.35, transition: "opacity 0.2s", cursor: "pointer" }}
                                onClick={() => setHighlightedProject((prev) => prev === proj?.id ? null : proj?.id ?? null)}
                              >
                                <td className="breakdown-table__cell--name">
                                  <span className="color-dot" style={{ background: c.color }} />
                                  {c.name}
                                </td>
                                <td>R$ {c.cost.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td>Total</td>
                            <td>R$ {totalCost.toFixed(2)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
};

export default Dashboard;
