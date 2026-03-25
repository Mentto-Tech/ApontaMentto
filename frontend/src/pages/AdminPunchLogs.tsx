import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useIpGeocode, usePunchLogs, useReverseGeocode, useUsers } from "@/lib/queries";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { History } from "lucide-react";
import { formatIsoDateTimeToBr, formatYmdToBr } from "@/lib/datetime";

function formatLatLng(lat?: number | null, lng?: number | null) {
  if (lat == null || lng == null) return "-";
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

const GeoAddress = ({ lat, lng }: { lat?: number | null; lng?: number | null }) => {
  const { data, isFetching } = useReverseGeocode({ lat: lat ?? null, lng: lng ?? null, lang: "pt-BR" });
  if (lat == null || lng == null) return null;
  if (isFetching) return (
    <div className="text-muted-foreground">Endereço: carregando…</div>
  );
  if (!data?.displayName) return (
    <div className="text-muted-foreground">Endereço: —</div>
  );
  return (
    <div className="text-muted-foreground break-words">Endereço: {data.displayName}</div>
  );
};

const IpAddress = ({ ip }: { ip?: string | null }) => {
  const { data, isFetching } = useIpGeocode({ ip: ip ?? null, lang: "pt-BR" });
  if (!ip) return null;
  if (isFetching) return (
    <div className="text-muted-foreground">Local aproximado (IP): carregando…</div>
  );
  if (!data?.displayName) return (
    <div className="text-muted-foreground">Local aproximado (IP): —</div>
  );
  return (
    <div className="text-muted-foreground break-words">Local aproximado (IP): {data.displayName}</div>
  );
};

const AdminPunchLogs = () => {
  const { isAdmin } = useAuth();

  const [month, setMonth] = useState(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${d.getFullYear()}-${m}`;
  });

  const [date, setDate] = useState<string>("");
  const [userId, setUserId] = useState<string>("all");
  const [limit, setLimit] = useState<string>("200");

  const { data: users = [] } = useUsers();

  const effectiveParams = useMemo(() => {
    const trimmedDate = date.trim();
    const trimmedMonth = month.trim();
    const parsedLimit = Number(limit);

    return {
      month: trimmedDate ? undefined : trimmedMonth || undefined,
      date: trimmedDate || undefined,
      userId: userId === "all" ? undefined : userId,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    };
  }, [date, limit, month, userId]);

  const { data: logs = [], isLoading } = usePunchLogs(effectiveParams);

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center text-muted-foreground">
        Acesso restrito a administradores.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:py-10">
      <div className="flex items-start justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <History className="h-6 w-6 text-primary" />
          Logs de Batidas
        </h1>
      </div>

      <div className="bg-card border border-border rounded-lg p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] text-muted-foreground block">Mês</label>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              placeholder="2026-03"
              className="h-9"
              disabled={Boolean(date.trim())}
            />
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground block">Data</label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              placeholder="2026-03-24"
              className="h-9"
            />
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground block">Usuário</label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground block">Limite</label>
            <Input
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="200"
              className="h-9"
            />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setDate("");
              setUserId("all");
              setLimit("200");
            }}
          >
            Limpar filtros
          </Button>
          <div className="text-xs text-muted-foreground">
            {isLoading ? "Carregando…" : `${logs.length} log(s)`}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {logs.length === 0 && !isLoading && (
          <div className="text-sm text-muted-foreground text-center py-10">
            Nenhum log encontrado.
          </div>
        )}

        {logs.map((log) => {
          const who = users.find((u) => u.id === log.userId)?.username ?? log.userId;
          const value =
            log.field === "overtime_minutes"
              ? log.overtimeMinutes == null
                ? "-"
                : `${log.overtimeMinutes} min`
              : log.timeValue || "-";

          const latLng = formatLatLng(log.geoLat, log.geoLng);
          const mapsUrl =
            log.geoLat != null && log.geoLng != null
              ? `https://www.google.com/maps?q=${log.geoLat},${log.geoLng}`
              : null;

          return (
            <div key={log.id} className="bg-card border border-border rounded-lg p-4">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">
                    {who} · {formatYmdToBr(log.date)} · {log.field}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Registrado em: {formatIsoDateTimeToBr(log.recordedAt)}
                  </div>
                </div>

                <div className="text-sm">
                  <span className="text-muted-foreground">Horário:</span> {value}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3 text-xs">
                <div>
                  <div className="text-muted-foreground">Localização</div>
                  <div>
                    {latLng}
                    {mapsUrl ? (
                      <a
                        className="ml-2 underline text-primary"
                        href={mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        mapa
                      </a>
                    ) : null}
                  </div>
                  <GeoAddress lat={log.geoLat} lng={log.geoLng} />
                  {log.geoLat == null || log.geoLng == null ? (
                    <IpAddress ip={log.ipAddress} />
                  ) : null}
                  <div className="text-muted-foreground">
                    Fonte: {log.geoSource || "-"}
                    {log.geoAccuracy != null ? ` · ±${Math.round(log.geoAccuracy)}m` : ""}
                  </div>
                </div>

                <div>
                  <div className="text-muted-foreground">IP</div>
                  <div>{log.ipAddress || "-"}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminPunchLogs;
