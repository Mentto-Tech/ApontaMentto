import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTimeEntries, useProjects, useUsers } from "@/lib/queries";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import { BarChart3, Clock, FolderOpen, Users, DollarSign, Coffee, Zap, CalendarOff } from "lucide-react";
import "../styles/Dashboard.css";
import { formatYmdToBr } from "@/lib/datetime";

const CHART_COLORS = ["#0f766e", "#2563eb", "#9333ea", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#64748b", "#6366f1", "#ec4899"];

const Dashboard = () => {
  const { isAdmin, user } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: entries = [] } = useTimeEntries({
    // To refetch when filters change, we can pass them to the query hook
    // but for now, we filter client-side.
  });
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

  // Separate work vs break entries
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

  // Cost per project (admin only) — separate normal vs overtime rates
  const costPerProject = useMemo(() => {
    if (!isAdmin) return [];
    const map = new Map<string, { normal: number; overtime: number }>();
    workEntries.forEach((e) => {
      const u = userMap[e.userId || ""];
      const hours = calcMins(e) / 60;
      const projectId = e.projectId;
      const prev = map.get(projectId) || { normal: 0, overtime: 0 };
      if (e.isOvertime) {
        // Não existe overtimeHourlyRate, usar hourlyRate
        const rate = u?.hourlyRate || 0;
        prev.overtime += hours * rate;
      } else {
        const rate = u?.hourlyRate || 0;
        prev.normal += hours * rate;
      }
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

  const hoursPerUser = useMemo(() => {
    if (!isAdmin) return [];
    const map = new Map<string, number>();
    workEntries.forEach((e) => {
      map.set(e.userId || "unknown", (map.get(e.userId || "unknown") || 0) + calcMins(e));
    });
    return Array.from(map.entries())
      .map(([id, mins]) => ({
        name: userMap[id]?.username || "Desconhecido",
        hours: Math.round((mins / 60) * 100) / 100,
      }))
      .sort((a, b) => b.hours - a.hours);
  }, [workEntries, isAdmin, userMap]);

  const totalMinutes = workEntries.reduce((sum, e) => sum + calcMins(e), 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalMins = totalMinutes % 60;
  const totalCost = isAdmin ? costPerProject.reduce((s, c) => s + c.cost, 0) : 0;
  const breakTotalMins = breakEntries.reduce((sum, e) => sum + calcMins(e), 0);

  // Calcular horas extras e custo de horas extras (admin)
  const overtimeMins = workEntries.filter(e => e.isOvertime).reduce((sum, e) => sum + calcMins(e), 0);
  const totalOvertimeCost = isAdmin
    ? costPerProject.reduce((s, c) => s + (c.overtimeCost || 0), 0)
    : 0;

  // --- Unattributed Hours (CLT / Estagiário only) ---
  const unattributedData = useMemo(() => {
    if (!isAdmin) return [];
    // Only users with a weekly_hours target (CLT, Estagiário)
    const eligibleUsers = allUsers.filter(
      (u) => u.weeklyHours && u.weeklyHours > 0 && ["clt", "estagiario"].includes(u.category || "")
    );
    if (eligibleUsers.length === 0) return [];

    // Determine the date range of filtered entries
    const allDates = filteredEntries.map((e) => e.date).filter(Boolean) as string[];
    if (allDates.length === 0) return [];
    const minDate = allDates.reduce((a, b) => (a < b ? a : b));
    const maxDate = allDates.reduce((a, b) => (a > b ? a : b));

    // Get Monday from a date string
    const getWeekStart = (dateStr: string) => {
      const d = new Date(dateStr + "T00:00:00");
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(d.setDate(diff));
      return monday.toISOString().slice(0, 10);
    };

    // Collect all week-starts in range
    const weekStarts = new Set<string>();
    const cur = new Date(minDate + "T00:00:00");
    const end = new Date(maxDate + "T00:00:00");
    while (cur <= end) {
      weekStarts.add(getWeekStart(cur.toISOString().slice(0, 10)));
      cur.setDate(cur.getDate() + 7); // Jump to next week
    }

    const results: {
      userName: string;
      weekStart: string;
      expected: number;
      allocated: number;
      unattributed: number;
    }[] = [];

    for (const u of eligibleUsers) {
      for (const ws of weekStarts) {
        // Sum allocated hours for this user in this week
        const weekEnd = new Date(ws + "T00:00:00");
        weekEnd.setDate(weekEnd.getDate() + 6);
        const weStr = weekEnd.toISOString().slice(0, 10);

        const userWeekEntries = workEntries.filter(
          (e) => e.userId === u.id && e.date >= ws && e.date <= weStr
        );
        const allocatedMins = userWeekEntries.reduce((sum, e) => sum + calcMins(e), 0);
        const allocatedHours = Math.round((allocatedMins / 60) * 100) / 100;
        const expected = u.weeklyHours!;
        const unattributed = Math.max(0, expected - allocatedHours);

        if (unattributed > 0.01) { // Use a small epsilon
          results.push({
            userName: u.username,
            weekStart: ws,
            expected,
            allocated: allocatedHours,
            unattributed: Math.round(unattributed * 100) / 100,
          });
        }
      }
    }

    return results.sort(
      (a, b) => a.weekStart.localeCompare(b.weekStart) || a.userName.localeCompare(b.userName)
    );
  }, [isAdmin, allUsers, filteredEntries, workEntries]);

  const totalUnattributed = unattributedData.reduce((sum, d) => sum + d.unattributed, 0);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 md:py-10">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          {isAdmin && (
            <div className="min-w-[180px]">
              <label className="text-xs text-muted-foreground mb-1 block">Usuário</label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os usuários</SelectItem>
                  {allUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">De</label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-auto" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Até</label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-auto" />
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
        {isAdmin && totalUnattributed > 0 ? (
          <div className="db-card bg-card border border-border">
            <CalendarOff className="db-card__icon text-orange-500" />
            <div className="db-card__body">
              <div className="db-card__value">{totalUnattributed.toFixed(2)}h</div>
              <div className="db-card__label text-muted-foreground">Horas Não Atribuídas</div>
            </div>
          </div>
        ) : null}
      </div>

      <Tabs defaultValue="projects">
        <TabsList className="mb-4">
          <TabsTrigger value="hours">Horas</TabsTrigger>
          {isAdmin ? <TabsTrigger value="cost">Custo por Projeto</TabsTrigger> : null}
          {isAdmin && unattributedData.length > 0 ? <TabsTrigger value="unattributed">Não Atribuídas</TabsTrigger> : null}
        </TabsList>

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

            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-4">Distribuição</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={hoursPerProject}
                    dataKey="hours"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                    fontSize={11}
                  >
                    {hoursPerProject.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: number) => [`${val}h`, "Horas"]} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {isAdmin && hoursPerUser.length > 0 ? (
              <div className="bg-card border border-border rounded-lg p-4 md:col-span-2">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Users className="h-4 w-4" /> Horas por Usuário
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={hoursPerUser}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(val: number) => [`${val}h`, "Horas"]} />
                    <Bar dataKey="hours" radius={[6, 6, 0, 0]}>
                      {hoursPerUser.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : null}
          </div>
        </TabsContent>

        {isAdmin ? (
          <TabsContent value="cost">
            <div className="bg-card border border-border rounded-lg p-4">
              {costPerProject.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  Configure o valor/hora dos usuários em "Gerenciar Usuários" para ver os custos.
                </div>
              ) : (
                <>
                  <h3 className="text-sm font-semibold mb-4">Custo por Projeto (R$)</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={costPerProject} layout="vertical" margin={{ left: 10 }}>
                      <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={v => `R$${v}`} />
                      <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(val: number) => [`R$ ${val.toFixed(2)}`, "Custo"]} />
                      <Bar dataKey="cost" radius={[0, 6, 6, 0]}>
                        {costPerProject.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Cost breakdown table */}
                  <div className="mt-4 border-t border-border pt-4">
                    <div className="max-h-[420px] overflow-y-auto pr-2">
                      <table className="breakdown-table">
                        <thead>
                          <tr>
                            <th>Projeto</th>
                            <th>Custo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {costPerProject.map(c => (
                            <tr key={c.name}>
                              <td className="breakdown-table__cell--name">
                                <span className="color-dot" style={{ background: c.color }} />
                                {c.name}
                              </td>
                              <td>R$ {c.cost.toFixed(2)}</td>
                            </tr>
                          ))}
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

        {isAdmin && unattributedData.length > 0 ? (
          <TabsContent value="unattributed">
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <CalendarOff className="h-4 w-4 text-red-500" />
                Horas Não Atribuídas por Semana
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                Diferença entre horas semanais esperadas e horas alocadas em projetos.
                Aplica-se apenas a usuários CLT e Estagiário.
              </p>
              <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-center font-medium p-2">Usuário</th>
                      <th className="text-center font-medium p-2">Semana de</th>
                      <th className="text-center font-medium p-2">Esperado</th>
                      <th className="text-center font-medium p-2">Alocado</th>
                      <th className="text-center font-medium p-2 text-orange-500">Não Atribuído</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unattributedData.map((d, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="text-center p-2">{d.userName}</td>
                        <td className="text-center p-2 text-xs">{formatYmdToBr(d.weekStart)}</td>
                        <td className="text-center p-2">{d.expected}h</td>
                        <td className="text-center p-2">{d.allocated}h</td>
                        <td className="text-center p-2 text-red-500 font-medium">{d.unattributed}h</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border">
                      <td colSpan={4} className="text-center p-2 font-medium">Total não atribuído</td>
                      <td className="text-center p-2 text-red-500 font-medium">{Math.round(totalUnattributed * 100) / 100}h</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
};

export default Dashboard;
