const BRAZIL_TIME_ZONE = "America/Sao_Paulo";

function isoHasTimezone(iso: string): boolean {
  return /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso);
}

function normalizeIsoAssumingUtc(iso: string): string {
  // If server sends an ISO string without timezone (naive), treat it as UTC.
  return isoHasTimezone(iso) ? iso : `${iso}Z`;
}

export function formatYmdToBr(ymd?: string | null): string {
  if (!ymd) return "-";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const [, yyyy, mm, dd] = m;
  return `${dd}/${mm}/${yyyy}`;
}

export function formatIsoDateTimeToBr(
  iso?: string | null,
  opts?: { seconds?: boolean }
): string {
  if (!iso) return "-";

  try {
    const normalized = normalizeIsoAssumingUtc(iso);
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return iso;

    const formatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: BRAZIL_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: opts?.seconds === false ? undefined : "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const partMap: Record<string, string> = {};
    for (const p of parts) partMap[p.type] = p.value;

    const day = partMap.day;
    const month = partMap.month;
    const year = partMap.year;
    const hour = partMap.hour;
    const minute = partMap.minute;
    const second = partMap.second;

    const datePart = `${day}/${month}/${year}`;
    const timePart = opts?.seconds === false ? `${hour}:${minute}` : `${hour}:${minute}:${second}`;
    return `${datePart} ${timePart}`;
  } catch {
    return iso;
  }
}

export function todayBrForFilename(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
}
