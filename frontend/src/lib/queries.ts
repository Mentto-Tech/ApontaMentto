import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { Project, Location, TimeEntry, DailyRecord, AbsenceJustification, PunchLog } from "@/lib/store";

// ---------------------------------------------------------------------------
// Types (re-exported for convenience)
// ---------------------------------------------------------------------------
export type { Project, Location, TimeEntry, DailyRecord };
export type { AbsenceJustification };
export type { PunchLog };

export interface ReverseGeocodeResult {
  displayName?: string | null;
  address?: Record<string, unknown> | null;
}

export interface IpGeocodeResult {
  displayName?: string | null;
  raw?: Record<string, unknown> | null;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  hourlyRate?: number | null;
  overtimeHourlyRate?: number | null;
  category: "pj" | "clt" | "estagiario" | "dono";
  weeklyHours?: number | null;
}


// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => apiFetch<Project[]>("/api/projects"),
    staleTime: 30_000,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Project, "id" | "createdAt">) =>
      apiFetch<Project>("/api/projects", { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Omit<Project, "createdAt">) =>
      apiFetch<Project>(`/api/projects/${id}`, { method: "PUT", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/projects/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------
export function useLocations() {
  return useQuery<Location[]>({
    queryKey: ["locations"],
    queryFn: () => apiFetch<Location[]>("/api/locations"),
    staleTime: 30_000,
  });
}

export function useCreateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Location, "id" | "createdAt">) =>
      apiFetch<Location>("/api/locations", { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations"] }),
  });
}

export function useUpdateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Omit<Location, "createdAt">) =>
      apiFetch<Location>(`/api/locations/${id}`, { method: "PUT", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations"] }),
  });
}

export function useDeleteLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/locations/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations"] }),
  });
}

// ---------------------------------------------------------------------------
// Time Entries
// ---------------------------------------------------------------------------
export function useTimeEntries(params?: {
  date?: string;
  month?: string;
  userId?: string;
}) {
  const search = new URLSearchParams();
  if (params?.date) search.set("date", params.date);
  if (params?.month) search.set("month", params.month);
  if (params?.userId) search.set("userId", params.userId);
  const qs = search.toString() ? `?${search.toString()}` : "";

  return useQuery<TimeEntry[]>({
    queryKey: ["time-entries", params ?? {}],
    queryFn: () => apiFetch<TimeEntry[]>(`/api/time-entries${qs}`),
    staleTime: 10_000,
  });
}

export function useCreateTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<TimeEntry, "id">) =>
      apiFetch<TimeEntry>("/api/time-entries", { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["time-entries"] }),
  });
}

export function useDeleteTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/time-entries/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["time-entries"] }),
  });
}

// ---------------------------------------------------------------------------
// Users (admin only)
// ---------------------------------------------------------------------------
export function useUsers() {
  const { isAdmin } = useAuth();
  return useQuery<AuthUser[]>({
    queryKey: ["users"],
    queryFn: () => apiFetch<AuthUser[]>("/api/users"),
    enabled: isAdmin,
    staleTime: 30_000,
  });
}

export function useUpdateUserAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      ...data
    }: {
      userId: string;
      hourlyRate?: number | null;
      overtimeHourlyRate?: number | null;
      category?: string;
      weeklyHours?: number | null;
    }) =>
      apiFetch<AuthUser>(`/api/users/${userId}`, {
        method: "PATCH",
        body: data,
      }),
    onSuccess: (updatedUser) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      // Also update the current user in the auth context if it matches
      const authUser = qc.getQueryData<AuthUser>(["auth", "me"]);
      if (authUser && authUser.id === updatedUser.id) {
        qc.setQueryData(["auth", "me"], updatedUser);
      }
    },
  });
}

export function useExportData() {
  return useQuery<Record<string, unknown>>({
    queryKey: ["admin-export"],
    queryFn: () => apiFetch<Record<string, unknown>>("/api/admin/export"),
    enabled: false, // only triggered manually
  });
}

export function useImportData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch<{ ok: boolean; imported: Record<string, number> }>("/api/admin/import", {
        method: "POST",
        body: data,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["locations"] });
      qc.invalidateQueries({ queryKey: ["time-entries"] });
      qc.invalidateQueries({ queryKey: ["daily-records"] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name?: string; email?: string }) =>
      apiFetch<AuthUser>("/api/users/me", { method: "PUT", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth-me"] }),
  });
}

// ---------------------------------------------------------------------------
// Daily Records (clock-in / clock-out)
// ---------------------------------------------------------------------------
export function useDailyRecords(params?: {
  date?: string;
  month?: string;
  userId?: string;
}) {
  const search = new URLSearchParams();
  if (params?.date) search.set("date", params.date);
  if (params?.month) search.set("month", params.month);
  if (params?.userId) search.set("userId", params.userId);
  const qs = search.toString() ? `?${search.toString()}` : "";

  return useQuery<DailyRecord[]>({
    queryKey: ["daily-records", params ?? {}],
    queryFn: () => apiFetch<DailyRecord[]>(`/api/daily-records${qs}`),
    staleTime: 10_000,
  });
}

export function useUpsertDailyRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      date: string;
      // legacy
      clockIn?: string | null;
      clockOut?: string | null;
      // folha
      in1?: string | null;
      out1?: string | null;
      in2?: string | null;
      out2?: string | null;
      overtimeMinutes?: number | null;
      // geo
      geoLat?: number | null;
      geoLng?: number | null;
      geoAccuracy?: number | null;
      geoSource?: string | null;
    }) =>
      apiFetch<DailyRecord>("/api/daily-records", { method: "PUT", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["daily-records"] }),
  });
}

// ---------------------------------------------------------------------------
// Absence Justifications
// ---------------------------------------------------------------------------
export function useJustifications(params?: {
  date?: string;
  month?: string;
  userId?: string;
}) {
  const search = new URLSearchParams();
  if (params?.date) search.set("date", params.date);
  if (params?.month) search.set("month", params.month);
  if (params?.userId) search.set("userId", params.userId);
  const qs = search.toString() ? `?${search.toString()}` : "";

  return useQuery<AbsenceJustification[]>({
    queryKey: ["justifications", params ?? {}],
    queryFn: () => apiFetch<AbsenceJustification[]>(`/api/justifications${qs}`),
    staleTime: 10_000,
  });
}

export function useCreateJustification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: FormData) =>
      apiFetch<AbsenceJustification>("/api/justifications", {
        method: "POST",
        body: data,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["justifications"] }),
  });
}

export function useDeleteJustification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/justifications/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["justifications"] }),
  });
}

// ---------------------------------------------------------------------------
// Punch Logs
// ---------------------------------------------------------------------------
export function usePunchLogs(params?: {
  date?: string;
  month?: string;
  userId?: string;
  limit?: number;
}) {
  const search = new URLSearchParams();
  if (params?.date) search.set("date", params.date);
  if (params?.month) search.set("month", params.month);
  if (params?.userId) search.set("userId", params.userId);
  if (params?.limit) search.set("limit", String(params.limit));
  const qs = search.toString() ? `?${search.toString()}` : "";

  return useQuery<PunchLog[]>({
    queryKey: ["punch-logs", params ?? {}],
    queryFn: () => apiFetch<PunchLog[]>(`/api/punch-logs${qs}`),
    staleTime: 5_000,
  });
}

// ---------------------------------------------------------------------------
// Geocode
// ---------------------------------------------------------------------------
export function useReverseGeocode(params?: {
  lat?: number | null;
  lng?: number | null;
  lang?: string;
}) {
  const lat = params?.lat;
  const lng = params?.lng;
  const enabled = lat != null && lng != null;

  // Round for cache key stability and provider friendliness.
  const latKey = enabled ? Number(lat!.toFixed(5)) : null;
  const lngKey = enabled ? Number(lng!.toFixed(5)) : null;

  const search = new URLSearchParams();
  if (enabled) {
    search.set("lat", String(latKey));
    search.set("lng", String(lngKey));
    search.set("lang", params?.lang || "pt-BR");
  }
  const qs = enabled ? `?${search.toString()}` : "";

  return useQuery<ReverseGeocodeResult>({
    queryKey: ["reverse-geocode", latKey, lngKey, params?.lang || "pt-BR"],
    queryFn: () => apiFetch<ReverseGeocodeResult>(`/api/geocode/reverse${qs}`),
    enabled,
    retry: 1,
    staleTime: 30 * 60 * 1000,
  });
}

export function useIpGeocode(params?: { ip?: string | null; lang?: string }) {
  const ip = params?.ip?.trim();
  const enabled = Boolean(ip);

  const search = new URLSearchParams();
  if (enabled && ip) {
    search.set("ip", ip);
    search.set("lang", params?.lang || "pt-BR");
  }
  const qs = enabled ? `?${search.toString()}` : "";

  return useQuery<IpGeocodeResult>({
    queryKey: ["ip-geocode", ip || null, params?.lang || "pt-BR"],
    queryFn: () => apiFetch<IpGeocodeResult>(`/api/geocode/ip${qs}`),
    enabled,
    retry: 1,
    staleTime: 30 * 60 * 1000,
  });
}
