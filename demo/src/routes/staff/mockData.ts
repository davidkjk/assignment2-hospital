// 직원 웹 데모용 가짜 데이터.
// 정본: 규칙 TODAY-*/SHELL-*/ROLE-* (screen-behaviors.md), 구현기준 스펙 §1~§8 + plan 2026-08-15-staff-web.
// 데모라 백엔드·마이그레이션 없이 화면만 — 해피패스 + 정상 흐름 UI.

export type StaffRole = 'receptionist' | 'doctor' | 'admin'

export interface CurrentStaff {
  name: string
  role: StaffRole
  email: string
  dept?: string
}

/** 역할 한글 라벨 (역할 칩·로그인 결과에 노출) */
export const ROLE_LABEL: Record<StaffRole, string> = {
  receptionist: '접수직원',
  doctor: '의사',
  admin: '관리자',
}

// 데모 기본 로그인 계정 = 관리자(사이드바 4그룹을 다 보여 주기 위함).
// 로그인 화면에서 역할을 바꿔 시연할 수 있게 세 계정을 둔다(STAFF-LOGIN은 역할 선택 칸이 없으므로
// 데모에서는 "이 이메일=이 역할"로 매핑만 해 둔다 — 실제 앱은 서버가 staff.role을 읽는다).
export const DEMO_ACCOUNTS: Record<string, CurrentStaff> = {
  'admin@gaon.kr': { name: '김서연', role: 'admin', email: 'admin@gaon.kr', dept: '원무과' },
  'reception@gaon.kr': { name: '박지민', role: 'receptionist', email: 'reception@gaon.kr', dept: '원무과' },
  'doctor@gaon.kr': { name: '이정훈', role: 'doctor', email: 'doctor@gaon.kr', dept: '내과' },
}

export const DEFAULT_STAFF = DEMO_ACCOUNTS['admin@gaon.kr']

// ── 마스킹(목록 화면 전부) — MASK-TEL-01·MASK-DOB-01 ──
/** 010-1234-5678 → 010-****-5678 (뒷자리 남김) */
export function maskPhone(tel: string): string {
  return tel.replace(/^(\d{3})-?\d{3,4}-?(\d{4})$/, '$1-****-$2')
}
/** 1958-03-12 → 1958-**-12 (월만 가림) */
export function maskBirth(d: string): string {
  return d.replace(/^(\d{4})-\d{2}-(\d{2})$/, '$1-**-$2')
}

// ── 「지금 처리할 것」 4종 카드 (TODAY-WAIT / NOSHOW / YDAY / RESCHED) ──
export type ProblemKind = 'wait' | 'noshow' | 'yday' | 'resched'

export interface ProblemRow {
  id: string
  time: string // 시각 레일 (오늘이 아니면 날짜 포함: '8/20 16:30')
  future?: boolean // 아직 오지 않은/미래 예약이면 레일 옅게
  name: string
  birth: string // 원본(마스킹은 표시 때)
  dept: string
  doctor: string
  reason: string // 사유 칸 (주의색)
  tel?: string // 원본 전화번호 (번호 보기 전엔 마스킹, MASK-VIEW-01)
  emergency?: boolean
  smsFailed?: string // '안내 못 함' / '안내 못 함 · 번호 확인 필요'
}

export interface ProblemCard {
  kind: ProblemKind
  title: string
  rows: ProblemRow[]
}

export const problemCards: ProblemCard[] = [
  {
    kind: 'wait',
    title: '장기 대기',
    rows: [
      { id: 'w1', time: '09:10', name: '정순남', birth: '1948-05-21', dept: '정형외과', doctor: '박강우', reason: '52분 대기' },
      { id: 'w2', time: '09:25', name: '김태호', birth: '1972-11-03', dept: '내과', doctor: '이정훈', reason: '38분 대기' },
    ],
  },
  {
    kind: 'noshow',
    title: '미접수 · 시각 경과',
    rows: [
      { id: 'n1', time: '09:00', name: '이말녀', birth: '1955-08-17', dept: '내과', doctor: '한서연', reason: '예약 시각 40분 지남', tel: '010-2841-5678' },
      { id: 'n2', time: '09:30', name: '윤도현', birth: '1990-02-28', dept: '피부과', doctor: '윤지호', reason: '예약 시각 10분 지남', tel: '010-3092-1043' },
    ],
  },
  {
    kind: 'yday',
    title: '전일 미완료',
    rows: [
      { id: 'y1', time: '8/20 16:30', name: '한복순', birth: '1943-12-09', dept: '내과', doctor: '이정훈', reason: '진료 중인 채로 마감' },
    ],
  },
  {
    kind: 'resched',
    title: '확인 필요 예약',
    rows: [
      { id: 'r1', time: '8/23 14:00', future: true, name: '오정례', birth: '1951-07-30', dept: '이비인후과', doctor: '정우재', reason: '8/23 휴진 등록됨' },
      { id: 'r2', time: '8/23 15:20', future: true, name: '강민서', birth: '1988-04-11', dept: '이비인후과', doctor: '정우재', reason: '8/23 휴진 등록됨', smsFailed: '안내 못 함' },
      { id: 'r3', time: '8/22 11:00', future: true, name: '서준영', birth: '1979-09-25', dept: '안과', doctor: '오세림', reason: '취소 상담 · 직원 확인 중' },
    ],
  },
]

/** 「지금 처리할 것」 총계 (제목 옆 주의색 숫자, TODAY-LAY-03) */
export const problemTotal = problemCards.reduce((n, c) => n + c.rows.length, 0)

// ── 「오늘 요약」 숫자 타일 6개 (TODAY-SUM-01) ──
export interface SummaryTile {
  key: string
  label: string
  count: number
  tone: 'teal' | 'amber' | 'sky' | 'violet' | 'gray' | 'neutral'
}
export const summaryTiles: SummaryTile[] = [
  { key: 'all', label: '전체 예약', count: 64, tone: 'neutral' },
  { key: 'arrived', label: '도착', count: 12, tone: 'violet' },
  { key: 'waiting', label: '진료 대기', count: 7, tone: 'sky' },
  { key: 'in_progress', label: '진료 중', count: 3, tone: 'teal' },
  { key: 'done', label: '진료 완료', count: 28, tone: 'gray' },
  { key: 'cancelled', label: '취소·부도', count: 5, tone: 'amber' },
]

// ── 의사별 대기 인원 (TODAY-DOC-01: 진료과 생략 안 함) ──
export interface DoctorWait {
  dept: string
  doctor: string
  waiting: number
}
export const doctorWaits: DoctorWait[] = [
  { dept: '내과', doctor: '이정훈', waiting: 3 },
  { dept: '내과', doctor: '한서연', waiting: 1 },
  { dept: '정형외과', doctor: '박강우', waiting: 2 },
  { dept: '이비인후과', doctor: '정우재', waiting: 1 },
]

/** 사이드바 주의색 배지 숫자 (SHELL-NAV-05, 0이면 표시 안 함) */
export const navBadges: Record<string, number> = {
  '/staff/today': problemTotal,
  '/staff/tickets': 3,
  '/staff/messages': 2,
}

// ── 대기 목록 (/queue) — QUEUE-* ──
export type QueueStatus = 'not_arrived' | 'arrived' | 'waiting' | 'in_progress' | 'done' | 'cancelled'
export type CancelKind = '환자 취소' | '병원 취소' | '예약 부도'

// 7개 상태 탭 (QUEUE-TAB-01) — 한 번에 하나, 0명도 숨기지 않음(QUEUE-TAB-06)
export const QUEUE_TABS: { key: QueueStatus | 'all'; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'not_arrived', label: '아직 안 옴' },
  { key: 'arrived', label: '도착' },
  { key: 'waiting', label: '진료 대기' },
  { key: 'in_progress', label: '진료 중' },
  { key: 'done', label: '진료 완료' },
  { key: 'cancelled', label: '취소·부도' },
]

export interface QueuePatient {
  id: string
  name: string
  birth: string
  tel?: string
  dept: string
  doctor: string
  status: QueueStatus
  apptTime: string // 예약 시각 (아직 안 옴 탭의 순번 자리)
  waitMin?: number // 도착=경과 / 진료 대기=대기 / 진료 중=진행 분
  order?: number // 진료 대기 순번 (병원 전체 기준, QUEUE-ORDER-03)
  emergency?: boolean
  emergencyBy?: string // '오늘 09:32 · 박지민'
  walkIn?: boolean
  cancelKind?: CancelKind
}

export const queuePatients: QueuePatient[] = [
  // 아직 안 옴 (예약확정, 미접수)
  { id: 'q1', name: '이말녀', birth: '1955-08-17', tel: '010-2841-5678', dept: '내과', doctor: '한서연', status: 'not_arrived', apptTime: '09:00' },
  { id: 'q2', name: '윤도현', birth: '1990-02-28', tel: '010-3092-1043', dept: '피부과', doctor: '윤지호', status: 'not_arrived', apptTime: '09:30' },
  { id: 'q3', name: '조현우', birth: '1982-06-04', tel: '010-7734-2201', dept: '안과', doctor: '오세림', status: 'not_arrived', apptTime: '10:20' },
  // 도착 (체크인, 진료 대기 전)
  { id: 'q4', name: '배수정', birth: '1975-03-22', dept: '정형외과', doctor: '박강우', status: 'arrived', apptTime: '09:15', waitMin: 8 },
  { id: 'q5', name: '문상호', birth: '1968-10-11', dept: '내과', doctor: '이정훈', status: 'arrived', apptTime: '09:40', waitMin: 3 },
  // 진료 대기 (순번 부여)
  { id: 'q6', name: '정순남', birth: '1948-05-21', dept: '정형외과', doctor: '박강우', status: 'waiting', apptTime: '08:50', waitMin: 52, order: 1, emergency: true, emergencyBy: '오늘 09:32 · 박지민' },
  { id: 'q7', name: '김태호', birth: '1972-11-03', dept: '내과', doctor: '이정훈', status: 'waiting', apptTime: '09:05', waitMin: 38, order: 2 },
  { id: 'q8', name: '한지아', birth: '1995-01-19', dept: '내과', doctor: '이정훈', status: 'waiting', apptTime: '09:20', waitMin: 21, order: 3 },
  { id: 'q9', name: '오세훈', birth: '1960-07-08', dept: '이비인후과', doctor: '정우재', status: 'waiting', apptTime: '09:35', waitMin: 12, order: 4, walkIn: true },
  { id: 'q10', name: '신보라', birth: '2001-12-30', dept: '내과', doctor: '한서연', status: 'waiting', apptTime: '09:45', waitMin: 6, order: 5 },
  // 진료 중
  { id: 'q11', name: '강대식', birth: '1953-04-02', dept: '정형외과', doctor: '박강우', status: 'in_progress', apptTime: '09:00', waitMin: 14 },
  { id: 'q12', name: '류하은', birth: '1988-09-17', dept: '피부과', doctor: '윤지호', status: 'in_progress', apptTime: '09:10', waitMin: 6 },
  // 진료 완료
  { id: 'q13', name: '백승우', birth: '1979-02-14', dept: '내과', doctor: '이정훈', status: 'done', apptTime: '08:30' },
  { id: 'q14', name: '전미경', birth: '1965-11-28', dept: '안과', doctor: '오세림', status: 'done', apptTime: '08:40' },
  { id: 'q15', name: '고은채', birth: '1998-05-09', dept: '이비인후과', doctor: '정우재', status: 'done', apptTime: '08:45' },
  // 취소·부도 (세 종류 구분, QUEUE-BTN-09)
  { id: 'q16', name: '남기훈', birth: '1971-08-23', dept: '내과', doctor: '한서연', status: 'cancelled', apptTime: '09:00', cancelKind: '환자 취소' },
  { id: 'q17', name: '허영란', birth: '1957-03-30', dept: '정형외과', doctor: '최다인', status: 'cancelled', apptTime: '09:20', cancelKind: '예약 부도' },
  { id: 'q18', name: '임재현', birth: '1984-12-05', dept: '피부과', doctor: '윤지호', status: 'cancelled', apptTime: '10:00', cancelKind: '병원 취소' },
]

/** 탭별 인원 수 (0도 표시, QUEUE-TAB-06) */
export function queueCount(key: QueueStatus | 'all'): number {
  if (key === 'all') return queuePatients.length
  return queuePatients.filter((p) => p.status === key).length
}

/** 대기시간 글자 — 탭마다 다름 (QUEUE-ROW-06) */
export function waitLabel(p: QueuePatient): string | null {
  if (p.waitMin == null) return null
  if (p.status === 'arrived') return `${p.waitMin}분 경과`
  if (p.status === 'waiting') return `${p.waitMin}분 대기`
  if (p.status === 'in_progress') return `${p.waitMin}분째`
  return null
}
