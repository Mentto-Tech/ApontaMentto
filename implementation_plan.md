# ApontaMentto — New Features Implementation Plan

Add JSON import/export, default "Atividades Internas" project, user categories (PJ/CLT/Estagiário/Dono), and an unattributed hours system to the time-tracking application.

## User Review Required

> [!IMPORTANT]
> **User categories drive business logic**: CLT and Estagiário users have `weekly_hours` (e.g. 40h/week) and show unattributed hours in the dashboard. PJ and Dono users do **not** — they have no weekly hour target, so no unattributed hours are computed.

> [!WARNING]
> **JSON Import is destructive**: The import endpoint will **merge** data by default (skip existing IDs, insert new ones). It will *not* delete existing data. If you need a "full replace" mode, let me know — I can add that behind a `?mode=replace` flag.

---

## Proposed Changes

### Backend — Database Models & Migration

#### [MODIFY] [models.py](file:///c:/Users/luis/Desktop/Mentto/apontamentto/backend/models.py)

- Add `UserCategory` enum: `pj`, `clt`, `estagiario`, `dono`
- Add `category` column to [User](file:///c:/Users/luis/Desktop/Mentto/apontamentto/backend/models.py#25-39) (default `clt`, nullable=False)
- Add `weekly_hours` column to [User](file:///c:/Users/luis/Desktop/Mentto/apontamentto/backend/models.py#25-39) (Float, nullable=True — populated for CLT/Estagiário)
- Add `is_internal` boolean column to [Project](file:///c:/Users/luis/Desktop/Mentto/apontamentto/frontend/src/lib/store.ts#3-10) (default `False`)

#### [NEW] [003_add_user_category_weekly_hours_internal_project.py](file:///c:/Users/luis/Desktop/Mentto/apontamentto/backend/alembic/versions/003_add_user_category_weekly_hours_internal_project.py)

Alembic migration adding the 3 new columns (`category`, `weekly_hours` on [users](file:///c:/Users/luis/Desktop/Mentto/apontamentto/backend/routers/users.py#15-22); `is_internal` on [projects](file:///c:/Users/luis/Desktop/Mentto/apontamentto/backend/routers/projects.py#17-24)). Existing users default to `clt`.

---

### Backend — Schemas

#### [MODIFY] [schemas.py](file:///c:/Users/luis/Desktop/Mentto/apontamentto/backend/schemas.py)

- [UserOut](file:///c:/Users/luis/Desktop/Mentto/apontamentto/backend/schemas.py#43-50): add `category: str`, `weekly_hours: Optional[float]`
- [UserUpdateRate](file:///c:/Users/luis/Desktop/Mentto/apontamentto/backend/schemas.py#52-55) → rename to `UserUpdateAdmin` and add `category` + `weekly_hours` fields
- [ProjectOut](file:///c:/Users/luis/Desktop/Mentto/apontamentto/backend/schemas.py#71-77): add `is_internal: bool`
- [ProjectIn](file:///c:/Users/luis/Desktop/Mentto/apontamentto/backend/schemas.py#65-69): add `is_internal: bool = False`

---

### Backend — Seed

#### [MODIFY] [seed.py](file:///c:/Users/luis/Desktop/Mentto/apontamentto/backend/seed.py)

- After creating admin user, also create "Atividades Internas" project (`is_internal=True`, color `#6366f1`)
- Set admin user category to `dono`

---

### Backend — Admin Data Import/Export Router

#### [NEW] [admin_data.py](file:///c:/Users/luis/Desktop/Mentto/apontamentto/backend/routers/admin_data.py)

Two endpoints (admin-only):

- `GET /api/admin/export` — Queries all Users, Projects, Locations, TimeEntries, DailyRecords and returns a single JSON file download
- `POST /api/admin/import` — Accepts a JSON body with the same structure; merges (upserts) into the database, skipping existing IDs

#### [MODIFY] [main.py](file:///c:/Users/luis/Desktop/Mentto/apontamentto/backend/main.py)

- Register `admin_data.router` at `/api/admin`

---

### Backend — Users Router

#### [MODIFY] [users.py](file:///c:/Users/luis/Desktop/Mentto/apontamentto/backend/routers/users.py)

- Update [update_rate](file:///c:/Users/luis/Desktop/Mentto/apontamentto/backend/routers/users.py#24-40) to also accept and save `category` + `weekly_hours`

---

### Frontend — Types & Queries

#### [MODIFY] [store.ts](file:///c:/Users/luis/Desktop/Mentto/apontamentto/frontend/src/lib/store.ts)

- Add `isInternal?: boolean` to [Project](file:///c:/Users/luis/Desktop/Mentto/apontamentto/frontend/src/lib/store.ts#3-10) interface

#### [MODIFY] [queries.ts](file:///c:/Users/luis/Desktop/Mentto/apontamentto/frontend/src/lib/queries.ts)

- [AuthUser](file:///c:/Users/luis/Desktop/Mentto/apontamentto/frontend/src/lib/queries.ts#11-19) type: add `category`, `weeklyHours`
- Add `useExportData()` query and `useImportData()` mutation
- Update [useUpdateUserRate](file:///c:/Users/luis/Desktop/Mentto/apontamentto/frontend/src/lib/queries.ts#148-159) → accept `category` + `weeklyHours`

#### [MODIFY] [AuthContext.tsx](file:///c:/Users/luis/Desktop/Mentto/apontamentto/frontend/src/contexts/AuthContext.tsx)

- [AuthUser](file:///c:/Users/luis/Desktop/Mentto/apontamentto/frontend/src/lib/queries.ts#11-19) interface: add `category?: string`, `weeklyHours?: number | null`

---

### Frontend — Admin Users Page (Category + Weekly Hours)

#### [MODIFY] [AdminUsers.tsx](file:///c:/Users/luis/Desktop/Mentto/apontamentto/frontend/src/pages/AdminUsers.tsx)

- Add a "Categoria" dropdown per user: PJ / CLT / Estagiário / Dono
- Add a "Horas/semana" input (shown only when category is CLT or Estagiário)
- Save these along with hourly rates

---

### Frontend — Admin Settings Page (Import/Export)

#### [NEW] [AdminSettings.tsx](file:///c:/Users/luis/Desktop/Mentto/apontamentto/frontend/src/pages/AdminSettings.tsx)

- "Exportar Dados (JSON)" button — calls `GET /api/admin/export` and triggers file download
- "Importar Dados (JSON)" — file picker + upload, calls `POST /api/admin/import`
- Styled consistently with the rest of the app

#### [MODIFY] [App.tsx](file:///c:/Users/luis/Desktop/Mentto/apontamentto/frontend/src/App.tsx)

- Add route `/admin/settings` → `AdminSettings` (AdminRoute)

#### [MODIFY] AppLayout navigation

- Add "Configurações" link for admin users (need to find the AppLayout/Sidebar component)

---

### Frontend — Dashboard: Unattributed Hours

#### [MODIFY] [Dashboard.tsx](file:///c:/Users/luis/Desktop/Mentto/apontamentto/frontend/src/pages/Dashboard.tsx)

- For admin view: compute unattributed hours per user per week within the selected date range
- Logic: for each CLT/Estagiário user with `weeklyHours > 0`, compare `weeklyHours` vs. total allocated hours that week → difference = unattributed
- Show a summary card "Horas Não Atribuídas" and a breakdown table (user × week)
- PJ and Dono users are excluded from this calculation

---

## Verification Plan

### Manual Testing

1. **Run Alembic migration**: `alembic upgrade head` from the backend directory
2. **Run seed**: `python seed.py` — verify "Atividades Internas" project is created
3. **Test Export**: login as admin → go to `/admin/settings` → click Export → verify downloaded JSON has all tables
4. **Test Import**: modify the downloaded JSON (add a new project) → Import it → verify new project appears
5. **Test User Categories**: go to `/admin/users` → change a user to "CLT" with 40h/week → save → refresh → verify persistence
6. **Test Unattributed Hours**: with a CLT user having 40h/week, view Dashboard for a week where the user only logged 30h → verify 10h shows as unattributed
7. **Test PJ/Dono exclusion**: set a user as "PJ" → verify no weekly_hours input shown, and that user doesn't appear in the unattributed hours section
