import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { Project, Location, TimeEntry } from "@/lib/store";

// ---------------------------------------------------------------------------
// Types (re-exported for convenience)
// ---------------------------------------------------------------------------
export type { Project, Location, TimeEntry };

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  hourlyRate?: number | null;
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

export function useUpdateUserRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, hourlyRate }: { userId: string; hourlyRate: number | null }) =>
      apiFetch<AuthUser>(`/api/users/${userId}/rate`, {
        method: "PATCH",
        body: { hourlyRate },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
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
