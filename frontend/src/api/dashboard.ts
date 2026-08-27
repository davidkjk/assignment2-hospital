import { apiFetch } from './httpClient'

// 대시보드 조회의 얇은 클라이언트 — 경로·형태만 안다. 오류·오프라인·세션은 httpClient가 지킨다.
// 백엔드 계약: backend/app/services/dashboard_service.py::get_today_summary
// ⚠️ 응답은 한 번에 온다(SHELL-LIVE-01·03) — 타일·오래 대기·지원 요청 행이 같은 시점을 말하도록.

/** 「오늘 요약」 숫자 타일 6개(TODAY-SUM-01). 세는 곳은 서버 한 곳이다. */
export interface TodayTiles {
  total_reserved: number
  arrived: number
  waiting: number
  in_progress: number
  completed: number
  cancelled_or_noshow: number
}

/** patient_row_dto 화이트리스트 — 원문 이름·번호는 없고 masked_* 로만 온다(MASK-SRV-01). */
export interface PatientRow {
  patient_id: string
  masked_name?: string
  masked_phone?: string
  masked_birth_date?: string
  appointment_id?: string
}

/** 장기 대기 행(TODAY-WAIT-01) — 대기 분이 함께 온다. */
export interface LongWaitRow extends PatientRow {
  wait_minutes: number
}

/** 확인 필요한 예약 행(TODAY-RESCHED-23) — 취소·변경 상담이 사유로 온다. */
export interface NeedsAttentionRow extends PatientRow {
  reason: string
}

/** 미접수·시각 경과 행(TODAY-NOSHOW-01) — 예약 시각(slot_time)이 시각 레일로 온다. */
export interface NotArrivedRow extends PatientRow {
  slot_time: string
}

/** 전일 미완료 행(TODAY-YDAY-01/03) — 지난 날짜라 날짜(slot_date)를 함께 준다. */
export interface YesterdayUnfinishedRow extends PatientRow {
  slot_date: string
  slot_time: string
  reason: string
}

/** 의사별 대기(TODAY-DOC-01) — 진료과+의사 이름과 대기 수. 집계라 환자 원문이 없다. */
export interface DoctorWaitingRow {
  doctor_id: string
  doctor_name: string
  department_name: string
  waiting_count: number
}

export interface TodaySummary {
  tiles: TodayTiles
  long_wait: LongWaitRow[]
  needs_attention: NeedsAttentionRow[]
  /** 미접수·시각 경과(TODAY-NOSHOW-01). */
  not_arrived: NotArrivedRow[]
  /** 전일 미완료(TODAY-YDAY-01). */
  yesterday_unfinished: YesterdayUnfinishedRow[]
  /** 의사별 대기(TODAY-DOC-01) — 요약 API 단일 소스(프론트 이중계산 방지). */
  doctor_waiting: DoctorWaitingRow[]
  /** 이 카드에 줄이 있는 사람은 사이드바 배지가 두 번 세지 않는다(TODAY-RESCHED-21). */
  badge_excluded_patient_ids: string[]
  /** 확인 필요 상담 문의 건수. 4단계 계약이 없으면 null(STAT-METRIC-06) — 0이 아니다. */
  bot_pending: number | null
}

export function getTodaySummary() {
  return apiFetch<TodaySummary>('/today/summary')
}
