import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Search, Clock, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useTimeEntries, useProjects, useLocations, useUsers } from "@/lib/queries";
import { useNavigate } from "react-router-dom";

const MonthlyView = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [searchDay, setSearchDay] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("mine");

  const monthStr = format(currentMonth, "yyyy-MM");
  const { data: entries = [] } = useTimeEntries({ month: monthStr });
  const { data: projects = [] } = useProjects();
  const { data: locations = [] } = useLocations();
  const { data: allUsers = [] } = useUsers();

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));
  const locationMap = Object.fromEntries(locations.map(l => [l.id, l]));
  const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // The API already filters by current user for non-admins.
  // For admins, apply client-side filter based on selection.
  const filteredEntries = useMemo(() => {
    if (!isAdmin || selectedUserId === "mine") {
      return entries.filter(e => e.userId === user?.id);
    }
    if (selectedUserId === "all") return entries;
    return entries.filter(e => e.userId === selectedUserId);
  }, [entries, isAdmin, user, selectedUserId]);

  const dayData = useMemo(() => {
    return daysInMonth.map(day => {
      const dateStr = format(day, "yyyy-MM-dd");
      const dayEntries = filteredEntries.filter(e => e.date === dateStr);
      const totalMins = dayEntries.reduce((sum, e) => {
        const [sh, sm] = e.startTime.split(":").map(Number);
        const [eh, em] = e.endTime.split(":").map(Number);
        return sum + (eh * 60 + em) - (sh * 60 + sm);
      }, 0);
      return { day, dateStr, entries: dayEntries, totalMins };
    }).filter(d => {
      if (!searchDay) return true;
      const dayNum = format(d.day, "dd");
      const dayName = format(d.day, "EEEE", { locale: ptBR });
      return dayNum.includes(searchDay) || dayName.toLowerCase().includes(searchDay.toLowerCase());
    });
  }, [daysInMonth, filteredEntries, searchDay, currentMonth]);

  const prevMonth = () => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const totalMonthMins = dayData.reduce((s, d) => s + d.totalMins, 0);
  const totalH = Math.floor(totalMonthMins / 60);
  const totalM = totalMonthMins % 60;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:py-10">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Calendar className="h-6 w-6 text-primary" />
        Visão Mensal
      </h1>

      {/* Month nav + filters */}
      <div className="bg-card border border-border rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <Button variant="ghost" size="icon" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-lg font-bold capitalize">
            {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </span>
          <Button variant="ghost" size="icon" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar dia..."
              value={searchDay}
              onChange={e => setSearchDay(e.target.value)}
              className="pl-8"
            />
          </div>
          {isAdmin && (
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mine">Meus registros</SelectItem>
                <SelectItem value="all">Todos os usuários</SelectItem>
                {allUsers.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-primary">
        <Clock className="h-4 w-4" />
        Total do mês: {totalH}h{totalM > 0 ? ` ${totalM}min` : ""}
      </div>

      {/* Day list */}
      <div className="space-y-2">
        {dayData.map(({ day, dateStr, entries: dayEntries, totalMins }) => {
          const h = Math.floor(totalMins / 60);
          const m = totalMins % 60;
          return (
            <div
              key={dateStr}
              className={`bg-card border border-border rounded-lg p-3 transition-colors ${
                dayEntries.length > 0 ? "" : "opacity-50"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold w-6 text-center">{format(day, "dd")}</span>
                  <span className="text-xs text-muted-foreground capitalize">
                    {format(day, "EEEE", { locale: ptBR })}
                  </span>
                </div>
                <div className="text-xs font-semibold text-primary">
                  {totalMins > 0 ? `${h}h${m > 0 ? `${m}m` : ""}` : "—"}
                </div>
              </div>
              {dayEntries.length > 0 && (
                <div className="ml-8 space-y-1">
                  {dayEntries.map(entry => {
                    const project = projectMap[entry.projectId];
                    const location = locationMap[entry.locationId];
                    return (
                      <div key={entry.id} className="flex items-center gap-2 text-xs">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: project?.color || "hsl(var(--primary))" }}
                        />
                        <span className="font-medium">{entry.startTime}–{entry.endTime}</span>
                        <span className="text-muted-foreground truncate">
                          {project?.name} · {location?.name}
                          {isAdmin && selectedUserId === "all" && entry.userId && (
                            <> · {userMap[entry.userId]?.name}</>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MonthlyView;
