import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTimeEntries, useProjects, useUsers } from "@/lib/queries";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import { BarChart3, Clock, FolderOpen, Users, DollarSign, Coffee, Zap } from "lucide-react";
import "./Dashboard.css";

const CHART_COLORS = ["#0f766e", "#2563eb", "#9333ea", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#64748b", "#6366f1", "#ec4899"];

const Dashboard = () => {
  const { isAdmin, user } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: entries = [] } = useTimeEntries();
  const { data: projects = [] } = useProjects();
  const { data: allUsers = [] } = useUsers();

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));
  const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));

  const filteredEntries = useMemo(() => {
    let filtered = entries;
    if (!isAdmin) {
      filtered = filtered.filter(e => e.userId === user?.id);
    } else if (selectedUserId !== "all") {
      filtered = filtered.filter(e => e.userId === selectedUserId);
    }
    if (dateFrom) filtered = filtered.filter(e => e.date >= dateFrom);
    if (dateTo) filtered = filtered.filter(e => e.date <= dateTo);
    return filtered;
  }, [entries, isAdmin, user, selectedUserId, dateFrom, dateTo]);

  const calcMins = (e: { startTime: string; endTime: string }) => {
    const [sh, sm] = e.startTime.split(":").map(Number);
    const [eh, em] = e.endTime.split(":").map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
  };

  // Separate work vs break entries
  const workEntries = useMemo(() => filteredEntries.filter(e => e.entryType !== "break"), [filteredEntries]);
  const breakEntries = useMemo(() => filteredEntries.filter(e => e.entryType === "break"), [filteredEntries]);

  const hoursPerProject = useMemo(() => {
    const map = new Map<string, number>();
    workEntries.forEach(e => {
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
    workEntries.forEach(e => {
      const u = userMap[e.userId || ""];
      const hours = calcMins(e) / 60;
      const projectId = e.projectId;
      const prev = map.get(projectId) || { normal: 0, overtime: 0 };
      if (e.isOvertime) {
        const rate = u?.overtimeHourlyRate || u?.hourlyRate || 0;
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
      .filter(c => c.cost > 0)
      .sort((a, b) => b.cost - a.cost);
  }, [workEntries, isAdmin, userMap, projectMap]);

  const hoursPerUser = useMemo(() => {
    if (!isAdmin) return [];
    const map = new Map<string, number>();
    workEntries.forEach(e => {
      map.set(e.userId || "unknown", (map.get(e.userId || "unknown") || 0) + calcMins(e));
    });
    return Array.from(map.entries())
      .map(([id, mins]) => ({
        name: userMap[id]?.name || "Desconhecido",
        hours: Math.round((mins / 60) * 100) / 100,
      }))
      .sort((a, b) => b.hours - a.hours);
  }, [workEntries, isAdmin, userMap]);

  const totalMinutes = workEntries.reduce((sum, e) => sum + calcMins(e), 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalMins = totalMinutes % 60;
  const totalCost = isAdmin ? costPerProject.reduce((s, c) => s + c.cost, 0) : 0;
  const totalOvertimeCost = isAdmin ? costPerProject.reduce((s, c) => s + c.overtimeCost, 0) : 0;

  const breakTotalMins = breakEntries.reduce((sum, e) => sum + calcMins(e), 0);
  const overtimeEntries = workEntries.filter(e => e.isOvertime);
  const overtimeMins = overtimeEntries.reduce((sum, e) => sum + calcMins(e), 0);

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
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os usuários</SelectItem>
                  {allUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
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
        {overtimeMins > 0 && (
          <div className="db-card bg-card border border-border">
            <Zap className="db-card__icon text-amber-500" />
            <div className="db-card__body">
              <div className="db-card__value">{Math.floor(overtimeMins / 60)}h{overtimeMins % 60 > 0 ? ` ${overtimeMins % 60}m` : ""}</div>
              <div className="db-card__label text-muted-foreground">Horas extras</div>
            </div>
          </div>
        )}
        {breakTotalMins > 0 && (
          <div className="db-card bg-card border border-border">
            <Coffee className="db-card__icon text-orange-500" />
            <div className="db-card__body">
              <div className="db-card__value">{Math.floor(breakTotalMins / 60)}h{breakTotalMins % 60 > 0 ? ` ${breakTotalMins % 60}m` : ""}</div>
              <div className="db-card__label text-muted-foreground">Intervalos</div>
            </div>
          </div>
        )}
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
        {isAdmin && (
          <div className="db-card bg-card border border-border">
            <DollarSign className="db-card__icon text-primary" />
            <div className="db-card__body">
              <div className="db-card__value--money">R$ {totalCost.toFixed(2)}</div>
              <div className="db-card__label text-muted-foreground">
                Custo total{totalOvertimeCost > 0 && <span className="text-amber-500"> (HE: R$ {totalOvertimeCost.toFixed(2)})</span>}
              </div>
            </div>
          </div>
        )}
      </div>

      {filteredEntries.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhum registro encontrado para os filtros selecionados.</p>
        </div>
      ) : (
        <Tabs defaultValue="hours">
          <TabsList className="mb-4">
            <TabsTrigger value="hours">Horas</TabsTrigger>
            {isAdmin && <TabsTrigger value="cost">Custo por Projeto</TabsTrigger>}
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

              {isAdmin && hoursPerUser.length > 0 && (
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
              )}
            </div>
          </TabsContent>

          {isAdmin && (
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
                  </>
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
};

export default Dashboard;
