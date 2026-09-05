import { apiFetch } from './httpClient'

// [Task 29][HSET-*][HSETX-*] /admin/settings 병원 설정의 얇은 클라이언트.
// 백엔드 계약: backend/app/routers/settings.py
//   GET /admin/settings · PUT /admin/settings · GET /admin/settings/preview-cancellation?hours=
// ⛔ 휴무 편집·의사 일정은 /admin/schedule(Task 18) — 여기선 읽기 전용 줄 + 링크만.

/** 알림 종류값 — notify_patient MESSAGES 키와 정확히 같다(HSET-MSG-06 열 종). */
export type NotificationType =
  | 'requested' | 'confirmed' | 'reminder_day_before' | 'reminder_today' | 'changed'
  | 'hospital_cancelled' | 'cancellation_approved' | 'cancellation_rejected'
  | 'questionnaire_missing' | 'visit_completed'

/** 한 알림 줄 — 문구(코드 기본 or override)·기본여부·문자여부(HSET-MSG-02·24). */
export interface NotificationRow {
  body: string
  is_default: boolean
  send_sms: boolean
}

/** 항목별 최근 변경 한 줄(HSETX-AUDIT-01). */
export interface RecentChange {
  changed_at: string
  changed_by: string
  new_value: string | null
}

/** 예정 휴무 읽기 전용 한 줄(HSET-INFO-03). */
export interface UpcomingClosure {
  closure_date: string
  memo: string | null
}

/** GET /admin/settings 전체 — scalar + 알림 override + 예정 휴무 + 항목별 최근 변경. */
export interface Settings {
  cancellation_deadline_hours: number
  long_wait_threshold_minutes: number
  booking_window_weeks: number
  auto_confirm_app_bookings: boolean
  hospital_address: string | null
  hospital_phone: string | null
  sms_enabled: boolean
  sms_recipients: 'app_only' | 'all'
  sms_opt_out_number: string | null
  version: number
  sms_provider_connected: boolean
  notifications: Record<NotificationType, NotificationRow>
  upcoming_closures: UpcomingClosure[]
  recent_changes: Record<string, RecentChange>
}

/** PUT 본문의 알림 patch 한 줄 — body_override null = 코드 기본으로 되돌리기(HSET-MSG-22). */
export interface NotificationPatch {
  body_override?: string | null
  send_sms?: boolean
}

/** PUT /admin/settings 본문 — 바뀐 것만 담는다(HSET-SAVE-01 한 저장). */
export interface SettingsPatch {
  cancellation_deadline_hours?: number
  long_wait_threshold_minutes?: number
  booking_window_weeks?: number
  auto_confirm_app_bookings?: boolean
  hospital_address?: string | null
  hospital_phone?: string | null
  sms_enabled?: boolean
  sms_recipients?: 'app_only' | 'all'
  sms_opt_out_number?: string | null
  notifications?: Partial<Record<NotificationType, NotificationPatch>>
}

export function getSettings(): Promise<Settings> {
  return apiFetch<Settings>('/admin/settings')
}

/** PUT — 버전 충돌이면 409(ApiError.status). */
export function saveSettings(patch: SettingsPatch, baseVersion: number): Promise<{ ok: boolean; version: number }> {
  return apiFetch('/admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patch, base_version: baseVersion }),
  })
}

/** GET preview — 새 마감으로 마감 후가 되는 예약 건수만(HSETX-API-03). */
export function previewCancellation(hours: number): Promise<{ count: number }> {
  return apiFetch(`/admin/settings/preview-cancellation?hours=${hours}`)
}

/** GET preview — 예약 기간을 줄일 때 새 범위 밖에 남을 예약 건수만(SCHED-WINDOW-05). */
export function previewBookingWindow(weeks: number): Promise<{ count: number }> {
  return apiFetch(`/admin/settings/preview-booking-window?weeks=${weeks}`)
}

/** 화면 표시 순서·라벨(HSET-MSG-01 다섯째 줄, 10종). */
export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  requested: '예약 접수',
  confirmed: '예약 확정',
  reminder_day_before: '전날 알림',
  reminder_today: '당일 알림',
  changed: '예약 변경',
  hospital_cancelled: '병원 취소',
  cancellation_approved: '취소 처리됨',
  cancellation_rejected: '취소 상담 연결',
  questionnaire_missing: '문진표 요청',
  visit_completed: '진료 완료',
}

export const NOTIFICATION_ORDER: NotificationType[] = [
  'requested', 'confirmed', 'reminder_day_before', 'reminder_today', 'changed',
  'hospital_cancelled', 'cancellation_approved', 'cancellation_rejected',
  'questionnaire_missing', 'visit_completed',
]
