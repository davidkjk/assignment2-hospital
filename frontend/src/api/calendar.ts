import { apiFetch } from './httpClient'

// 예약 캘린더의 얇은 클라이언트 — 경로·본문만 안다. 오류·오프라인·세션은 httpClient가 지킨다.
// 백엔드 계약(이미 구현·커밋 3c70e63):
//   GET  /calendar?from&to&doctor_ids=   (dashboard_service.get_calendar)
//   POST /appointments/phone             (appointment_service.create_phone_appointment)

/** 예약 막대 한 줄 — patient_row_dto 화이트리스트(원문 이름은 masked_*로만 온다, MASK-SRV-01).
 *  start/end는 서버가 slot_date+start_time과 slot_duration으로 계산해 ISO로 준다(CAL-TIME-09). */
export interface CalendarBar {
  patient_id: string
  name?: string
  appointment_id: string
  doctor_id: string
  status: string
  start: string
  end: string | null
}

/** 빗금 구간 — resolve_day가 판정한 점심·휴진(CAL-SLOT-03·08·09·11). 화면이 자기 계산을 갖지 않는다. */
export interface CalendarBlock {
  doctor_id: string
  date: string
  kind: 'closed' | 'lunch'
  start: string | null
  end: string | null
  source: string
}

/** 격자 열 카탈로그(CAL-VIEW/NAME/COLOR) — Task 14c가 GET /calendar 응답에 더했다.
 *  ⚠️ palette_index는 지금 항상 null(색 저장 칸=Task 19 00042 미완, 갭 #83) — 화면이 정렬 순서로 잠정 배정한다. */
export interface CalendarDoctorCatalog {
  id: string
  name: string
  department_name: string | null
  palette_index: number | null
  /** [CAL-TIME-09] 그 날 요일의 진료 길이(분). 그 요일에 규칙이 없으면 null —
   *  근거가 없으면 서버가 지어내지 않는다(QUEUE-WALK-08c). */
  slot_minutes: number | null
}

/** 캘린더가 그릴 넷을 한 응답으로(CAL-SLOT-*·CAL-VIEW-*). 워크인(슬롯 없음)은 시각이 없어 여기 안 든다. */
export interface CalendarData {
  appointments: CalendarBar[]
  blocks: CalendarBlock[]
  /** ⚠ 확인 필요 — 일정 변경 영향 예약의 id만(CAL-SLOT-05). 원본 이름은 싣지 않는다. */
  affected_appointment_ids: string[]
  /** 격자 열 카탈로그 — 예약이 없는 의사도 열이 생긴다(CAL-COLOR-10). */
  doctors: CalendarDoctorCatalog[]
  /** [CAL-BOOK-13][SCHED-SLOT-09] 예약 가능한 **마지막 날**('YYYY-MM-DD').
   *  ⭐ 화면이 「8주」를 박지 않게 서버가 준다 — 갭 #47 재발 방지(`BOOK-DATE-08`).
   *  경계는 슬롯 생성과 같은 날이다(`slot_generator`가 오늘~오늘+N주를 덮는다). */
  booking_horizon_date: string
}

/** [CAL-PANEL-*] 한 예약 상세 — 캘린더 격자에 없어도(다른 날짜) 딥링크 패널이 읽는다.
 *  start는 병원 벽시계 naive ISO('YYYY-MM-DDTHH:MM:SS')다 — 막대와 같이 문자열로 자른다. */
export interface AppointmentDetailData {
  appointment_id: string
  status: string
  doctor_name: string | null
  department_name: string | null
  start: string | null
  patient: { patient_id: string; name?: string; masked_phone?: string; masked_birth_date?: string }
  support: { request_type: string; requested_at: string } | null
}

export function getAppointmentDetail(appointmentId: string): Promise<AppointmentDetailData> {
  return apiFetch<AppointmentDetailData>(`/appointments/${appointmentId}`)
}

export function getCalendar(params: {
  from: string
  to: string
  doctorIds?: string[] | null
}): Promise<CalendarData> {
  const query = new URLSearchParams({ from: params.from, to: params.to })
  if (params.doctorIds && params.doctorIds.length > 0) {
    query.set('doctor_ids', params.doctorIds.join(','))
  }
  return apiFetch<CalendarData>(`/calendar?${query.toString()}`)
}

/** 전화 예약(CAL-BOOK-*) — 5분 자유 시각. end_at·department_id는 서버가 도출한다(CAL-TIME-09).
 *  allow_overlap은 직원이 겹침 경고를 읽고 [그대로 잡기]를 눌렀다는 사실이다(CAL-GAP-06, 기본 false).
 *  위반 시: 5분·과거·닫힌시간 400, 겹침/같은시각 409. */
export interface CreatePhoneAppointmentBody {
  patient_id: string
  doctor_id: string
  start_at: string
  reason: string
  allow_overlap?: boolean
  // [A5] 직원이 정원 초과 경고를 읽고 [그래도 예약]을 눌렀다는 사실(SCHED-WEEK-03, 기본 false).
  allow_over_daily_max?: boolean
}

export function createPhoneAppointment(body: CreatePhoneAppointmentBody) {
  return apiFetch<{ appointment_id: string }>('/appointments/phone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ allow_overlap: false, ...body }),
  })
}
