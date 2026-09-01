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
  name?: string
  masked_phone?: string
  masked_birth_date?: string
  appointment_id?: string
  /** 데모 행이 「과 · 의사」를 함께 보여준다(S1·TODAY-DOC 동명 방지). today summary가 실어 보낸다. */
  department_name?: string
  doctor_name?: string
}

/** 장기 대기 행(TODAY-WAIT-01) — 대기 분 + 시각 레일용 예약 시각(TODAY-ROW-01). 당일 방문은 슬롯이 없어 null. */
export interface LongWaitRow extends PatientRow {
  wait_minutes: number
  slot_time: string | null
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
  /** [TODAY-YDAY-04] 마감 처리의 낙관적 잠금 열쇠. */
  updated_at: string
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

// ── 대기 목록 (/queue) ──────────────────────────────────────────────────────
// 백엔드 계약: backend/app/services/dashboard_service.py::get_queue

/** 탭 슬러그 7종(QUEUE-TAB-01) — URL·탭 숫자 키와 같은 영문 슬러그. */
export type QueueTab =
  | 'total' | 'not_arrived' | 'arrived' | 'waiting'
  | 'in_progress' | 'completed' | 'cancelled_or_noshow'

/** 탭마다의 인원(QUEUE-FILT-03) — 전체 기준(의사 필터를 따라가지 않는다). */
export type QueueTabCounts = Record<QueueTab, number>

/** 대기 목록 한 행 — 마스킹된 신원 + 도착처리·순서변경·원문공개에 필요한 안전 필드만. */
export interface QueueRow extends PatientRow {
  /** 대기 목록 행은 항상 예약 식별자를 갖는다(mutation·강조의 키). */
  appointment_id: string
  status: string
  /** 낙관적 동시성용(도착처리·긴급표시가 이 값을 expected_updated_at으로 되보낸다). */
  updated_at: string
  is_urgent_flag: boolean
  /** 당일 방문 배지(QUEUE-WALK-12) — 순번 자리 시각이 없는 이유를 설명한다. */
  is_walkin: boolean
  doctor_id: string
  doctor_name: string
  department_name: string
  /** 예약 시각("09:30:00") — 미도착 줄의 시각 레일(QUEUE-ORDER-02). 워크인은 null. */
  slot_time: string | null
  /** 진료 대기 탭에서만 온다(QUEUE-ORDER-01·02). 그 밖의 탭에는 없다. */
  queue_no?: number
  /** 대기시간(분) — 도착·진료대기·진료중일 때만. 그 밖(미도착·완료·취소)은 null(QUEUE-ROW-05·06). */
  wait_minutes?: number | null
  /** 기준(long_wait_threshold_minutes) 초과 여부 — 화면이 주의색으로 낸다(QUEUE-ROW-05). */
  wait_is_long?: boolean | null
  /** 응급/주의 표시를 켠 직원 이름 — 끄기 팝업의 「○○ 님이 켰습니다」(QUEUE-URG-06). 표시 없으면 null. */
  urgent_flagged_by_name?: string | null
  /** 응급/주의 표시를 켠 시각(ISO) — 끄기 팝업의 「오늘 09:32」(QUEUE-URG-06). 표시 없으면 null. */
  urgent_flagged_at?: string | null
}

export interface QueueResponse {
  rows: QueueRow[]
  tab_counts: QueueTabCounts
}

export function getQueue(params: { tab: QueueTab; doctorId?: string | null }) {
  const query = new URLSearchParams({ tab: params.tab })
  if (params.doctorId) query.set('doctor_id', params.doctorId)
  return apiFetch<QueueResponse>(`/queue?${query.toString()}`)
}
