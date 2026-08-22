// 관리자 기록 5화면 데모용 가짜 데이터.
// 실제 백엔드 없이 정상 흐름과 개인정보 경계를 보여준다.

export interface StatsMetric {
  key: string
  label: string
  value: number | string
  tone: 'neutral' | 'teal' | 'amber' | 'sky' | 'violet' | 'green'
  basis: string
  drillable: boolean
}

export interface StatsBreakdown {
  label: string
  value: number
  percent: number
}

export interface StatsPatient {
  id: string
  name: string
  birth: string
  phone: string
  status: string
  occurredAt: string
}

export const statsMetrics: StatsMetric[] = [
  { key: 'appointments', label: '예약', value: 428, tone: 'teal', basis: '생성일 기준', drillable: true },
  { key: 'visits', label: '실제 방문', value: 351, tone: 'green', basis: '상태 전이일 기준', drillable: true },
  { key: 'cancelled', label: '취소', value: 31, tone: 'amber', basis: '상태 전이일 기준', drillable: true },
  { key: 'noShow', label: '예약 부도', value: 12, tone: 'neutral', basis: '상태 전이일 기준', drillable: true },
  { key: 'wait', label: '평균 대기', value: '18분', tone: 'sky', basis: '대기 시작일 기준', drillable: false },
  { key: 'longWait', label: '오래 기다린 사례', value: 17, tone: 'violet', basis: '대기 시작일 기준', drillable: true },
  { key: 'tickets', label: '직원 연결 상담', value: 26, tone: 'neutral', basis: '생성일 기준', drillable: true },
  { key: 'completed', label: '진료 완료', value: 329, tone: 'green', basis: '상태 전이일 기준', drillable: true },
]

export const sourceBreakdown: StatsBreakdown[] = [
  { label: '환자 앱', value: 244, percent: 57 },
  { label: '직원 등록', value: 150, percent: 35 },
  { label: '상담봇', value: 34, percent: 8 },
]

export const statusBreakdown: StatsBreakdown[] = [
  { label: '진료 완료', value: 329, percent: 77 },
  { label: '예약확정', value: 56, percent: 13 },
  { label: '취소', value: 31, percent: 7 },
  { label: '예약 부도', value: 12, percent: 3 },
]

export const departmentBreakdown: StatsBreakdown[] = [
  { label: '내과', value: 164, percent: 38 },
  { label: '정형외과', value: 103, percent: 24 },
  { label: '피부과', value: 72, percent: 17 },
  { label: '안과', value: 54, percent: 13 },
  { label: '이비인후과', value: 35, percent: 8 },
]

export const doctorBreakdown: StatsBreakdown[] = [
  { label: '이정훈', value: 96, percent: 22 },
  { label: '박강우', value: 88, percent: 21 },
  { label: '한서연', value: 79, percent: 18 },
  { label: '윤지호', value: 72, percent: 17 },
  { label: '오세림', value: 54, percent: 13 },
]

export const statsPatients: StatsPatient[] = [
  { id: 'p1', name: '홍길동', birth: '1990-06-14', phone: '010-2345-5678', status: '예약확정', occurredAt: '2026.08.21 09:20' },
  { id: 'p2', name: '김민서', birth: '1978-11-02', phone: '010-5521-8834', status: '진료 완료', occurredAt: '2026.08.20 16:10' },
  { id: 'p3', name: '이말녀', birth: '1955-08-17', phone: '010-2841-5678', status: '예약 부도', occurredAt: '2026.08.20 09:40' },
  { id: 'p4', name: '박하늘', birth: '1988-03-25', phone: '010-7742-1092', status: '환자 취소', occurredAt: '2026.08.19 13:15' },
]

export type AccessAction =
  | '환자정보 열람'
  | '진료기록 열람'
  | '번호 열람'
  | '검색'
  | '대량 번호 열람'
  | '병합'
  | '병합 되돌림'
  | '통계 상세 열람'
  | '통계 CSV 내보내기'

export interface AccessLog {
  id: string
  occurredAt: string
  date: string
  staff: string
  patient?: { id: string; name: string; birth: string; phone: string }
  action: AccessAction
  reason: string
  detail?: string
  groupedPatients?: Array<{ name: string; birth: string; occurredAt: string }>
}

export const accessLogs: AccessLog[] = [
  { id: 'a1', occurredAt: '2026.08.22 10:14:32', date: '2026-08-22', staff: '박지민', patient: { id: 'p1', name: '홍길동', birth: '1990-06-14', phone: '010-2345-5678' }, action: '번호 열람', reason: '예약 변경 상담 연락' },
  { id: 'a2', occurredAt: '2026.08.22 10:11:08', date: '2026-08-22', staff: '김서연', action: '검색', reason: '환자 검색 1회 실행', detail: '검색어 원문은 감사 기록에 저장하지 않음' },
  { id: 'a3', occurredAt: '2026.08.22 09:58:44', date: '2026-08-22', staff: '이정훈', patient: { id: 'p2', name: '김민서', birth: '1978-11-02', phone: '010-5521-8834' }, action: '진료기록 열람', reason: '오늘 진료 전 과거 기록 확인' },
  { id: 'a4', occurredAt: '2026.08.22 09:42:15', date: '2026-08-22', staff: '김서연', action: '대량 번호 열람', reason: '검진 안내 발송 명단 확인', detail: '발송 명단 번호 열람 · 3,000명', groupedPatients: [
    { name: '최정희', birth: '1964-09-03', occurredAt: '09:42:15' },
    { name: '한도윤', birth: '1982-01-19', occurredAt: '09:42:15' },
    { name: '임서아', birth: '1995-05-28', occurredAt: '09:42:14' },
  ] },
  { id: 'a5', occurredAt: '2026.08.21 17:22:09', date: '2026-08-21', staff: '김서연', action: '통계 CSV 내보내기', reason: '2026.08.01~08.21 운영회의 자료', detail: '428행 · 소수 집계 억제 적용' },
  { id: 'a6', occurredAt: '2026.08.21 16:48:51', date: '2026-08-21', staff: '박지민', patient: { id: 'p3', name: '이말녀', birth: '1955-08-17', phone: '010-2841-5678' }, action: '환자정보 열람', reason: '미접수 예약 확인' },
  { id: 'a7', occurredAt: '2026.08.20 14:03:27', date: '2026-08-20', staff: '김서연', patient: { id: 'p4', name: '박하늘', birth: '1988-03-25', phone: '010-7742-1092' }, action: '병합', reason: '중복 환자 기록 병합 확정' },
]

export interface MergePatient {
  id: string
  displayId: string
  name: string
  birth: string
  phone: string
  accountLinked: boolean
  appointments: number
  questionnaires: number
  medicalRecords: number
  auditRecords: number
  lastVisit: string
  createdAt: string
}

export interface MergeCandidateGroup {
  id: string
  reason: string
  patients: [MergePatient, MergePatient]
}

export const mergeCandidates: MergeCandidateGroup[] = [
  {
    id: 'mc-01',
    reason: '이름·생년월일·전화번호가 같은 값으로 묶인 후보',
    patients: [
      { id: 'p101', displayId: '환자 #1042', name: '김민서', birth: '1978-11-02', phone: '010-5521-8834', accountLinked: true, appointments: 9, questionnaires: 4, medicalRecords: 7, auditRecords: 21, lastVisit: '2026.08.20', createdAt: '2023.04.12' },
      { id: 'p102', displayId: '환자 #2881', name: '김민서', birth: '1978-11-02', phone: '010-5521-8834', accountLinked: false, appointments: 2, questionnaires: 1, medicalRecords: 1, auditRecords: 4, lastVisit: '2026.06.04', createdAt: '2025.11.19' },
    ],
  },
  {
    id: 'mc-02',
    reason: '이름·전화번호가 같은 값으로 묶인 후보',
    patients: [
      { id: 'p201', displayId: '환자 #1208', name: '최정희', birth: '1964-09-03', phone: '010-4410-8215', accountLinked: false, appointments: 5, questionnaires: 2, medicalRecords: 3, auditRecords: 8, lastVisit: '2026.07.15', createdAt: '2024.02.01' },
      { id: 'p202', displayId: '환자 #3024', name: '최정희', birth: '1964-09-03', phone: '010-4410-8215', accountLinked: false, appointments: 1, questionnaires: 0, medicalRecords: 0, auditRecords: 2, lastVisit: '2026.01.08', createdAt: '2026.01.08' },
    ],
  },
]

export type MergeHistoryStatus = '되돌림 가능' | '되돌림 완료' | '되돌림불가'

export interface MergeHistoryEvent {
  id: string
  mergedAt: string
  mergedDate: string
  staff: string
  representative: MergePatient
  merged: MergePatient
  status: MergeHistoryStatus
  recordCounts: string
  lockReason?: string
  undoneAt?: string
  undoReason?: string
}

export const mergeHistory: MergeHistoryEvent[] = [
  { id: 'merge-028', mergedAt: '2026.08.20 14:03:27', mergedDate: '2026-08-20', staff: '김서연', representative: mergeCandidates[0].patients[0], merged: mergeCandidates[0].patients[1], status: '되돌림 가능', recordCounts: '예약 11건 · 문진 5건 · 진료기록 8건 · 감사 25건' },
  { id: 'merge-027', mergedAt: '2026.08.14 11:28:02', mergedDate: '2026-08-14', staff: '김서연', representative: mergeCandidates[1].patients[0], merged: mergeCandidates[1].patients[1], status: '되돌림 완료', recordCounts: '예약 6건 · 문진 2건 · 진료기록 3건 · 감사 10건', undoneAt: '2026.08.15 09:12:44', undoReason: '가족이 같은 전화번호를 사용하는 서로 다른 환자로 확인' },
  { id: 'merge-026', mergedAt: '2026.08.06 16:41:19', mergedDate: '2026-08-06', staff: '오지현', representative: { ...mergeCandidates[0].patients[0], displayId: '환자 #0812', name: '이도현' }, merged: { ...mergeCandidates[0].patients[1], displayId: '환자 #2711', name: '이도현' }, status: '되돌림불가', recordCounts: '예약 18건 · 문진 7건 · 진료기록 14건 · 감사 31건', lockReason: '병합 이후 대표 환자에 새 진료기록이 생성되었습니다' },
]

export type ErrorSeverity = '주의' | '오류' | '장애'

export interface SystemError {
  id: string
  occurredAt: string
  date: string
  feature: string
  severity: ErrorSeverity
  summary: string
  technicalDetail: string
  correlationId: string
  serviceWide?: boolean
}

export const systemErrors: SystemError[] = [
  { id: 'e1', occurredAt: '2026.08.22 09:32:18', date: '2026-08-22', feature: '문자 발송', severity: '장애', summary: '문자 서비스에 연결할 수 없어 전체 발송이 중단되었습니다.', technicalDetail: 'SmsProviderUnavailable: upstream timeout after 10s; recipient=[REDACTED]; api_key=[REDACTED]', correlationId: 'ERR-260822-093218', serviceWide: true },
  { id: 'e2', occurredAt: '2026.08.21 16:08:44', date: '2026-08-21', feature: '예약 동기화', severity: '오류', summary: '외부 일정과 예약 상태를 맞추지 못했습니다.', technicalDetail: 'CalendarSyncConflict: revision mismatch; patient_id=[REDACTED]; payload=[REDACTED]', correlationId: 'ERR-260821-160844' },
  { id: 'e3', occurredAt: '2026.08.20 11:47:03', date: '2026-08-20', feature: '문진 저장', severity: '주의', summary: '문진 응답 일부를 저장하지 못해 이전 내용이 유지되었습니다.', technicalDetail: 'QuestionnaireWriteRejected: schema version 14 is stale; response_body=[REDACTED]', correlationId: 'ERR-260820-114703' },
  { id: 'e4', occurredAt: '2026.08.18 08:15:29', date: '2026-08-18', feature: '직원 로그인', severity: '오류', summary: '로그인 확인 서비스 응답이 지연되어 요청이 종료되었습니다.', technicalDetail: 'AuthGatewayTimeout: 504; user_email=[REDACTED]; token=[REDACTED]', correlationId: 'ERR-260818-081529' },
]

export const SMALL_COUNT_THRESHOLD = 5

export function csvProtectedValue(value: number): string {
  return value < SMALL_COUNT_THRESHOLD ? '소수 인원 보호로 비공개' : String(value)
}

export function buildStatsCsv(from: string, to: string): string {
  const rows = [
    ['소수 인원 보호 안내', 'k=5 미만 및 역산 가능한 셀은 비공개입니다. 전체 집계는 관리자 화면에서 확인하세요.'],
    ['조회 기간', `${from}~${to}`],
    ['유입원', '건수'],
    ...sourceBreakdown.map((item) => [item.label, csvProtectedValue(item.value)]),
    ['예약 부도 세부 분류', csvProtectedValue(3)],
    ['보완 억제 분류', '소수 인원 보호로 비공개'],
  ]

  return rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
}
