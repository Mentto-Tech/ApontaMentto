import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTimeEntries, useProjects, useUsers } from "@/lib/queries";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { BarChart3, Clock, FolderOpen, DollarSign, Coffee, Zap, Users } from "lucide-react";
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 md:py-10">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

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
