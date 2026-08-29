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
// ✅ GET /admin/hours·/admin/closures는 붙었다(#6/L34, 2026-08-29) — 라이브에서 200으로 온다.
// ✅ 특정 날짜 변경(SCHED-EXC-*) 조회·저장·되돌리기 붙었다(L34 2단계, 2026-08-29).

// 「특정 날짜 변경」 화면이 받는 그날 데이터 한 벌.
export interface DayException {
  exceptions: DateException[]
  doctors: PanelDoctorDto[]
}
export interface PanelDoctorDto {
  id: string
  name: string
  regular_day_off: boolean
  appointment_count: number
}
export interface SaveExceptionBody {
  exception_date: string
  scope: 'hospital' | 'doctor'
  doctor_ids: string[]
  type: 'closed' | 'time'
  memo: string | null
  override_start: string | null
  override_end: string | null
}

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

  getHours: () => apiFetch<HospitalHoursRow[]>('/admin/hours'),
  listClosures: () => apiFetch<{ closure_date: string; memo: string | null }[]>('/admin/closures'),

  // ── 특정 날짜 변경(SCHED-EXC-*) ──
  /** [SCHED-EXC-01·07·11] 그 날 등록된 변경 + 「의사 고르기」 목록. */
  getDayExceptions: (date: string) => apiFetch<DayException>(`/admin/schedule/exceptions?date=${date}`),
  /** [SCHED-EXC-02] 그 달 달력에 ●를 찍을 날들. */
  getExceptionDays: (year: number, month: number) =>
    apiFetch<string[]>(`/admin/schedule/exception-days?year=${year}&month=${month}`),
  /** [SCHED-EXC-03·15] 저장 창구 하나 — affected(경고 건수)를 돌려준다. */
  saveDateException: (body: SaveExceptionBody) =>
    apiFetch<{ affected: number }>('/admin/schedule/exceptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  /** [SCHED-EXC-14] 그 줄만 지운다(id: uuid=의사예외 / "hospital:날짜"=병원휴무). */
  revertDateException: (id: string) =>
    apiFetch<{ status: string }>(`/admin/schedule/exceptions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
}
