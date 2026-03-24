// Simple localStorage-based store for ApontaMentto

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  isInternal?: boolean;
  createdAt: string;
}

export interface Location {
  id: string;
  name: string;
  address: string;
  createdAt: string;
}

export interface TimeEntry {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  projectId: string;
  locationId: string;
  notes: string;
  entryType?: string;  // "work" | "break"
  isOvertime?: boolean;
  userId?: string;
}

export interface DailyRecord {
  id: string;
  date: string; // YYYY-MM-DD
  // Legacy fields (still returned by API)
  clockIn?: string | null; // HH:mm
  clockOut?: string | null; // HH:mm

  // Folha de ponto (2 entradas / 2 saídas)
  in1?: string | null; // HH:mm
  out1?: string | null; // HH:mm
  in2?: string | null; // HH:mm
  out2?: string | null; // HH:mm
  overtimeMinutes?: number | null;

  // Localização/metadados do registro
  geoLat?: number | null;
  geoLng?: number | null;
  geoAccuracy?: number | null;
  geoSource?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  updatedAt?: string | null;
  userId: string;
  createdAt?: string;
}

export interface AbsenceJustification {
  id: string;
  date: string; // YYYY-MM-DD
  reasonText?: string | null;
  originalFilename?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  userId: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PunchLog {
  id: string;
  userId: string;
  dailyRecordId?: string | null;
  date: string; // YYYY-MM-DD
  field: string;
  timeValue?: string | null; // HH:mm
  overtimeMinutes?: number | null;
  recordedAt?: string | null;
  geoLat?: number | null;
  geoLng?: number | null;
  geoAccuracy?: number | null;
  geoSource?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface UserProfile {
  name: string;
  email: string;
  role: 'admin' | 'user';
}

const KEYS = {
  projects: 'apontamentto_projects',
  locations: 'apontamentto_locations',
  entries: 'apontamentto_entries',
  profile: 'apontamentto_profile',
};

function get<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}

function set<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

// Projects
export function getProjects(): Project[] {
  return get<Project[]>(KEYS.projects, []);
}

export function saveProject(project: Project) {
  const projects = getProjects();
  const idx = projects.findIndex(p => p.id === project.id);
  if (idx >= 0) projects[idx] = project;
  else projects.push(project);
  set(KEYS.projects, projects);
}

export function deleteProject(id: string) {
  set(KEYS.projects, getProjects().filter(p => p.id !== id));
}

// Locations
export function getLocations(): Location[] {
  return get<Location[]>(KEYS.locations, []);
}

export function saveLocation(location: Location) {
  const locations = getLocations();
  const idx = locations.findIndex(l => l.id === location.id);
  if (idx >= 0) locations[idx] = location;
  else locations.push(location);
  set(KEYS.locations, locations);
}

export function deleteLocation(id: string) {
  set(KEYS.locations, getLocations().filter(l => l.id !== id));
}

// Time Entries
export function getTimeEntries(): TimeEntry[] {
  return get<TimeEntry[]>(KEYS.entries, []);
}

export function getEntriesByDate(date: string): TimeEntry[] {
  return getTimeEntries().filter(e => e.date === date);
}

export function saveTimeEntry(entry: TimeEntry) {
  const entries = getTimeEntries();
  const idx = entries.findIndex(e => e.id === entry.id);
  if (idx >= 0) entries[idx] = entry;
  else entries.push(entry);
  set(KEYS.entries, entries);
}

export function deleteTimeEntry(id: string) {
  set(KEYS.entries, getTimeEntries().filter(e => e.id !== id));
}

// Profile
export function getProfile(): UserProfile {
  return get<UserProfile>(KEYS.profile, {
    name: 'Usuário',
    email: 'usuario@email.com',
    role: 'admin',
  });
}

export function saveProfile(profile: UserProfile) {
  set(KEYS.profile, profile);
}

// Helpers
export function generateId(): string {
  return crypto.randomUUID();
}
