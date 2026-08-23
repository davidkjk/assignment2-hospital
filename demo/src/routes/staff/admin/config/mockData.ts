// 관리자 설정 4화면 공용 가짜 데이터 (STAFF-* · SCHED-* · QADM-* · HSET-*).

// ── 직원 관리 (STAFF-*) ──
export type StaffRole = '접수직원' | '의사' | '관리자'
export interface StaffMember {
  id: string
  name: string
  role: StaffRole
  department?: string // 의사만
  active: boolean
  lastLogin?: string // 활성·로그인 기록 있음 (STAFF-LIST-07)
  invitePending?: boolean // 초대했지만 아직 안 들어옴 (STAFF-LIST-08)
  inviteSent?: string
  specialty?: string // 의사 프로필 (STAFF-PROFILE-*)
  bio?: string
  color?: number // 캘린더 팔레트 인덱스
}

export const ME = '김서연'

// 의사 6명 근무(요구사항 5~8명) + 초대 중 1명 + 중지 1명
export const staffMembers: StaffMember[] = [
  { id: 's1', name: '김서연', role: '관리자', active: true, lastLogin: '오늘 08:57' },
  { id: 's2', name: '박지민', role: '접수직원', active: true, lastLogin: '오늘 09:02' },
  { id: 's3', name: '이정훈', role: '의사', department: '내과', active: true, lastLogin: '오늘 08:40', specialty: '고혈압·당뇨 등 만성질환', bio: '내과 전문의. 만성질환 관리 20년.', color: 0 },
  { id: 's4', name: '한서연', role: '의사', department: '내과', active: true, lastLogin: '어제 17:26', specialty: '소화기 내시경', color: 3 },
  { id: 's5', name: '박강우', role: '의사', department: '정형외과', active: true, lastLogin: '오늘 08:33', specialty: '무릎·어깨 관절', color: 8 },
  { id: 's6', name: '정하윤', role: '의사', department: '정형외과', active: true, lastLogin: '오늘 08:21', specialty: '척추·재활', color: 6 },
  { id: 's8', name: '김도현', role: '의사', department: '이비인후과', active: true, lastLogin: '오늘 08:48', specialty: '비염·중이염', color: 1 },
  { id: 's9', name: '최유진', role: '의사', department: '가정의학과', active: true, lastLogin: '오늘 08:39', specialty: '건강검진·예방접종', color: 7 },
  { id: 's11', name: '서지훈', role: '의사', department: '내과', active: true, lastLogin: '오늘 08:52', specialty: '위·대장 소화기', color: 2 },
  { id: 's12', name: '오세영', role: '의사', department: '이비인후과', active: true, lastLogin: '어제 18:03', specialty: '이명·난청', color: 9 },
  { id: 's10', name: '윤재호', role: '의사', department: '가정의학과', active: true, invitePending: true, inviteSent: '8월 14일 초대 보냄' },
  { id: 's7', name: '최민석', role: '접수직원', active: false, lastLogin: '8월 6일 17:26' },
]

// 캘린더 색 팔레트 (CAL-COLOR-12에서 발췌)
export const PALETTE = [
  { fill: '#CBDDFF', ink: '#1360A6' },
  { fill: '#EEDBB3', ink: '#735C02' },
  { fill: '#FFCEE0', ink: '#A03865' },
  { fill: '#B4E8D1', ink: '#0B6C4E' },
  { fill: '#FFD2BE', ink: '#974726' },
  { fill: '#FFCED0', ink: '#874E51' },
  { fill: '#B1E4FF', ink: '#196584' },
  { fill: '#CDE4BD', ink: '#386A20' },
  { fill: '#E8D5FE', ink: '#6D4F9B' },
  { fill: '#DFDFB5', ink: '#5F6135' },
]

// ── 진료 일정 (SCHED-*) ──
export const weekDays = ['월', '화', '수', '목', '금', '토', '일'] as const
export type WeekDay = (typeof weekDays)[number]

export interface DaySchedule {
  dayOff: boolean
  open: string
  close: string
  slotMin: number
  lunch?: string // "12:30–13:30" 또는 없음
  maxPatients: number
  bookingDeadline: string // 예약 마감 시각
}

export interface DoctorSchedule {
  id: string
  name: string
  department: string
  week: Record<WeekDay, DaySchedule>
}

function weekTemplate(base: Omit<DaySchedule, 'dayOff'>, offDays: WeekDay[] = ['일']): Record<WeekDay, DaySchedule> {
  const out = {} as Record<WeekDay, DaySchedule>
  for (const d of weekDays) out[d] = { ...base, dayOff: offDays.includes(d) }
  return out
}

// 의사 8명(상한) · 하루 최대 인원 합 ≈ 106명(요구사항: 하루 외래 100명 안팎)
export const scheduleDoctors: DoctorSchedule[] = [
  { id: 's3', name: '이정훈', department: '내과', week: weekTemplate({ open: '09:00', close: '18:00', slotMin: 15, lunch: '12:00–13:00', maxPatients: 14, bookingDeadline: '17:30' }, ['일']) },
  { id: 's4', name: '한서연', department: '내과', week: weekTemplate({ open: '09:00', close: '17:00', slotMin: 20, lunch: '12:30–13:30', maxPatients: 13, bookingDeadline: '16:30' }, ['수', '일']) },
  { id: 's5', name: '박강우', department: '정형외과', week: weekTemplate({ open: '10:00', close: '18:00', slotMin: 20, lunch: '12:00–13:00', maxPatients: 13, bookingDeadline: '17:00' }, ['일']) },
  { id: 's6', name: '정하윤', department: '정형외과', week: weekTemplate({ open: '09:00', close: '18:00', slotMin: 20, lunch: '12:30–13:30', maxPatients: 13, bookingDeadline: '17:00' }, ['토', '일']) },
  { id: 's8', name: '김도현', department: '이비인후과', week: weekTemplate({ open: '09:00', close: '18:00', slotMin: 10, lunch: '12:00–13:00', maxPatients: 18, bookingDeadline: '17:30' }, ['일']) },
  { id: 's9', name: '최유진', department: '가정의학과', week: weekTemplate({ open: '09:00', close: '17:00', slotMin: 15, lunch: '13:00–14:00', maxPatients: 13, bookingDeadline: '16:30' }, ['일']) },
  { id: 's11', name: '서지훈', department: '내과', week: weekTemplate({ open: '09:00', close: '18:00', slotMin: 15, lunch: '12:00–13:00', maxPatients: 13, bookingDeadline: '17:30' }, ['일']) },
  { id: 's12', name: '오세영', department: '이비인후과', week: weekTemplate({ open: '09:00', close: '15:00', slotMin: 15, lunch: '12:00–13:00', maxPatients: 9, bookingDeadline: '14:30' }, ['일']) },
]

export interface Department {
  id: string
  name: string
  doctorCount: number
  active: boolean
}
export const departments: Department[] = [
  { id: 'dep1', name: '내과', doctorCount: 3, active: true },
  { id: 'dep2', name: '정형외과', doctorCount: 2, active: true },
  { id: 'dep4', name: '이비인후과', doctorCount: 2, active: true },
  { id: 'dep5', name: '가정의학과', doctorCount: 1, active: true },
  { id: 'dep3', name: '소아청소년과', doctorCount: 0, active: false },
]

export interface ScheduleException {
  id: string
  date: string // "2026-09-05 (금)"
  doctor: string // '전체'(병원 전체) 또는 의사 이름
  change: string
  affected: number // 그 날 걸리는 예약 건수 (SCHED-EXC-07/13)
}
export const scheduleExceptions: ScheduleException[] = [
  { id: 'e1', date: '2026-09-05 (금)', doctor: '박강우', change: '오후 휴진 (학회 참석)', affected: 6 },
  { id: 'e2', date: '2026-09-19 (금)', doctor: '김도현', change: '오전 휴진 (개인 사정)', affected: 4 },
  { id: 'e3', date: '2026-09-28 (월)', doctor: '전체', change: '추석 연휴 휴진', affected: 0 },
]

// ── 문진표 관리 (QADM-*) ──
export type QuestionType = '단답형' | '장문형' | '예/아니오'
export type QuestionAudience = '모든 환자' | '여성 환자만' | '남성 환자만'
export interface QnaQuestion {
  id: string
  text: string
  type: QuestionType
  required: boolean // 병원이 꼭 확인
  audience: QuestionAudience
}
export interface QnaDept {
  id: string
  name: string
  currentVersion: number | null // 없으면 문진표 없음
}
export const qnaDepartments: QnaDept[] = [
  { id: 'dep1', name: '내과', currentVersion: 3 },
  { id: 'dep2', name: '정형외과', currentVersion: 1 },
  { id: 'dep4', name: '이비인후과', currentVersion: 2 },
  { id: 'dep5', name: '가정의학과', currentVersion: null },
]
export const qnaQuestions: Record<string, QnaQuestion[]> = {
  dep1: [
    { id: 'q1', text: '오늘 방문하신 이유는 무엇인가요?', type: '장문형', required: true, audience: '모든 환자' },
    { id: 'q2', text: '현재 복용 중인 약이 있나요?', type: '장문형', required: true, audience: '모든 환자' },
    { id: 'q3', text: '알레르기가 있나요?', type: '단답형', required: false, audience: '모든 환자' },
    { id: 'q4', text: '임신 중이거나 가능성이 있나요?', type: '예/아니오', required: true, audience: '여성 환자만' },
  ],
  dep2: [
    { id: 'q5', text: '어느 부위가 아프신가요?', type: '단답형', required: true, audience: '모든 환자' },
    { id: 'q6', text: '다치신 적이 있나요?', type: '예/아니오', required: false, audience: '모든 환자' },
  ],
  dep4: [
    { id: 'q7', text: '어떤 증상으로 오셨나요?', type: '장문형', required: true, audience: '모든 환자' },
    { id: 'q8', text: '증상이 시작된 지 얼마나 되었나요?', type: '단답형', required: false, audience: '모든 환자' },
    { id: 'q9', text: '열이 있나요?', type: '예/아니오', required: true, audience: '모든 환자' },
  ],
}
export interface QnaVersion {
  versionNo: number
  savedAt: string
  savedBy: string
  questionCount: number
  current: boolean
}
export const qnaVersions: Record<string, QnaVersion[]> = {
  dep1: [
    { versionNo: 3, savedAt: '2026.08.10 14:20', savedBy: '김서연', questionCount: 4, current: true },
    { versionNo: 2, savedAt: '2026.05.02 11:05', savedBy: '김서연', questionCount: 3, current: false },
    { versionNo: 1, savedAt: '2026.01.15 09:40', savedBy: '이관리', questionCount: 3, current: false },
  ],
  dep2: [{ versionNo: 1, savedAt: '2026.03.20 10:00', savedBy: '김서연', questionCount: 2, current: true }],
  dep4: [
    { versionNo: 2, savedAt: '2026.07.11 09:30', savedBy: '김서연', questionCount: 3, current: true },
    { versionNo: 1, savedAt: '2026.02.08 14:15', savedBy: '이관리', questionCount: 2, current: false },
  ],
}

// ── 병원 설정 (HSET-*) ──
export interface HospitalSettings {
  cancellationDeadlineHours: number
  autoConfirm: boolean
  longWaitEnabled: boolean
  longWaitMin: number
  smsEnabled: boolean
  smsWho: '앱을 안 쓰는 환자만' | '모든 환자'
  hospitalAddress: string
  hospitalPhone: string
}
export const initialSettings: HospitalSettings = {
  cancellationDeadlineHours: 24,
  autoConfirm: true,
  longWaitEnabled: true,
  longWaitMin: 30,
  smsEnabled: true,
  smsWho: '앱을 안 쓰는 환자만',
  hospitalAddress: '서울시 강남구 가온로 12, 3층',
  hospitalPhone: '02-1234-5678',
}

export interface NotificationRow {
  kind: string
  text: string
  alsoSms: boolean
}
// 문구엔 [환자 이름]·[날짜]·[시각] 값을 꽂아 둔다(HSET-MSG-16). 진료과·의사명·증상은 넣지 않는다(HSET-MSG-11).
export const notificationRows: NotificationRow[] = [
  { kind: '예약 확정', text: '[환자 이름]님, 예약이 확정되었습니다. [날짜] [시각]에 뵙겠습니다.', alsoSms: false },
  { kind: '전날 알림', text: '[환자 이름]님, 내일 [날짜] [시각] 예약이 있습니다.', alsoSms: false },
  { kind: '당일 알림', text: '[환자 이름]님, 오늘 [시각] 예약이 있습니다.', alsoSms: true },
  { kind: '예약 변경', text: '[환자 이름]님, 예약이 [날짜] [시각]으로 변경되었습니다.', alsoSms: true },
  { kind: '병원 취소', text: '[환자 이름]님, 병원 사정으로 [날짜] 예약이 취소되었습니다.', alsoSms: true },
  { kind: '휴진 안내', text: '[환자 이름]님, 예약하신 날 진료일이 변경되었습니다. 앱에서 확인해 주세요.', alsoSms: true },
]
