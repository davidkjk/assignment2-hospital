import { apiFetch } from './httpClient'
import type {
  Department,
  DateException,
  HospitalHoursRow,
  OverviewDoctor,
  WeekRow,
} from '../pages/admin/schedule/types'

// [SCHED-*] /admin/schedule 표시층의 얇은 클라이언트 — 경로·형태만 안다.
// 백엔드 계약: backend/app/routers/schedule_admin.py (Task 17, prefix=/admin).
// ⚠️ Task 17에는 아직 GET(hours·closures·exceptions)이 없다 — PUT/POST만 있다.
//    아래 getHours·listClosures·listDexceptions는 그 GET이 생기면 바로 붙도록 얇게 둔 자리이고,
//    지금은 백엔드에 라우트가 없어 라이브에서는 비어 온다(이월 항목).

export const scheduleAdmin = {
  overview: () => apiFetch<OverviewDoctor[]>('/admin/schedule/overview'),

  week: (doctorId: string) => apiFetch<WeekRow[]>(`/admin/schedule/doctors/${doctorId}/week`),

  saveWeek: (doctorId: string, rows: WeekRow[]) =>
    apiFetch<{ saved: number; regenerated: unknown }>(`/admin/schedule/doctors/${doctorId}/week`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    }),

  /** 저장 전 미리보기(자리 증감·영향 예약) — dry_run=true. */
  regenerate: (doctorId: string, dryRun: boolean) =>
    apiFetch<Record<string, unknown>>(`/admin/schedule/doctors/${doctorId}/regenerate?dry_run=${dryRun}`, {
      method: 'POST',
    }),

  copyMonday: (doctorId: string) =>
    apiFetch<{ status: string }>(`/admin/schedule/doctors/${doctorId}/copy-monday`, { method: 'POST' }),

  upsertException: (doctorId: string, body: { exception_date: string; is_closed: boolean; override_start?: string | null; override_end?: string | null }) =>
    apiFetch<{ status: string }>(`/admin/schedule/doctors/${doctorId}/exceptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  departments: (includeInactive = false) =>
    apiFetch<Department[]>(`/admin/departments?include_inactive=${includeInactive}`),

  createDepartment: (name: string) =>
    apiFetch<{ id: string }>('/admin/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),

  renameDepartment: (id: string, name: string) =>
    apiFetch<{ status: string }>(`/admin/departments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),

  deactivateDepartment: (id: string) =>
    apiFetch<{ status: string }>(`/admin/departments/${id}/deactivate`, { method: 'POST' }),

  reactivateDepartment: (id: string) =>
    apiFetch<{ status: string }>(`/admin/departments/${id}/reactivate`, { method: 'POST' }),

  saveHours: (weekday: number, body: { open_time: string; close_time: string; lunch_start?: string | null; lunch_end?: string | null }) =>
    apiFetch<{ status: string }>(`/admin/hours/${weekday}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  createClosure: (body: { closure_date: string; memo?: string | null }) =>
    apiFetch<{ status: string }>('/admin/closures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  // ── 이월: 아래 GET들은 Task 17에 아직 없다(백엔드 라우트 추가 필요) ──
  getHours: () => apiFetch<HospitalHoursRow[]>('/admin/hours'),
  listClosures: () => apiFetch<{ closure_date: string; memo: string | null }[]>('/admin/closures'),
  listDateExceptions: (date: string) => apiFetch<DateException[]>(`/admin/schedule/exceptions?date=${date}`),
}
