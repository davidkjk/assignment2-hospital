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
