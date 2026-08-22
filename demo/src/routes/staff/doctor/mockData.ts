// 의사 콘솔 가짜 데이터 (DOCTOR-*) — 로그인 의사 본인의 오늘 환자.

export type VisitStatus = '도착' | '진료 대기' | '진료 중' | '진료 완료'

export interface QnaItem {
  q: string
  a: string
}
export interface InternalNote {
  at: string
  staff: string
  text: string
}
export interface HistoryRecord {
  date: string
  department: string
  doctor: string
  summary: string
}

export interface QueuePatient {
  id: string
  position: number
  name: string
  birth: string
  gender: '남' | '여'
  status: VisitStatus
  waitMin: number
  urgent?: string // 주의/응급 사유 (텍스트로도, DOCTOR-QUEUE-02)
  appt: { time: string; department: string; reason: string }
  questionnaire?: QnaItem[]
  notes?: InternalNote[]
  history?: HistoryRecord[]
}

export const loginDoctor = { name: '박강우', department: '정형외과' }

/** 로그인 의사가 자주 쓰는 소견 (DOCTOR-PHRASE-*) — 본인 소유 */
export const quickPhrases = [
  { label: '특이소견 없음', text: '특이 소견 관찰되지 않음.' },
  { label: '경과 관찰', text: '경과 관찰 요망. 증상 지속 시 재내원 안내.' },
  { label: '3일분 처방', text: '소염진통제 3일분 처방함.' },
  { label: '1주 후 재진', text: '1주 후 재진 예약 권고.' },
  { label: '물리치료 안내', text: '물리치료 병행 권고. 주 2~3회, 2주간.' },
]

export const queue: QueuePatient[] = [
  {
    id: 'q1', position: 1, name: '오세훈', birth: '1976-10-14', gender: '남', status: '진료 대기', waitMin: 12,
    appt: { time: '10:30', department: '정형외과', reason: '어깨 통증, 팔을 들 때 심함' },
    questionnaire: [
      { q: '오늘 방문하신 이유는 무엇인가요?', a: '2주 전부터 오른쪽 어깨가 아픔' },
      { q: '통증이 언제 심해지나요?', a: '팔을 위로 들 때, 자려고 누울 때' },
      { q: '현재 복용 중인 약이 있나요?', a: '고혈압약 (아침 1회)' },
      { q: '알레르기가 있나요?', a: '없음' },
    ],
    notes: [{ at: '2026.08.22 09:40', staff: '김접수', text: '지난번 X-ray 결과 문의하심. 오늘 함께 설명 요청.' }],
    history: [
      { date: '2026.05.12', department: '정형외과', doctor: '박강우', summary: '오른쪽 어깨 회전근개 염좌 의심, 물리치료 시작' },
      { date: '2025.11.03', department: '내과', doctor: '이정훈', summary: '고혈압 정기 진료, 약 유지' },
    ],
  },
  {
    id: 'q2', position: 2, name: '한지우', birth: '1999-03-08', gender: '여', status: '도착', waitMin: 5,
    appt: { time: '10:00', department: '정형외과', reason: '발목 염좌' },
    questionnaire: [
      { q: '오늘 방문하신 이유는 무엇인가요?', a: '어제 계단에서 발목을 접질림' },
      { q: '부기나 멍이 있나요?', a: '발목 바깥쪽이 부어 있음' },
    ],
    history: [],
  },
  {
    id: 'q3', position: 3, name: '신경자', birth: '1959-01-27', gender: '여', status: '도착', waitMin: 3,
    urgent: '보행 어려움 — 부축 필요',
    appt: { time: '11:30', department: '정형외과', reason: '무릎 관절 통증 재진' },
    questionnaire: [
      { q: '오늘 방문하신 이유는 무엇인가요?', a: '무릎이 계속 아프고 계단 오르기가 힘듦' },
      { q: '현재 복용 중인 약이 있나요?', a: '' },
    ],
    notes: [{ at: '2026.08.22 09:15', staff: '이관리', text: '거동 불편, 대기실 앞자리 안내함.' }],
    history: [
      { date: '2026.06.20', department: '정형외과', doctor: '박강우', summary: '좌측 무릎 퇴행성 관절염, 주사 치료 및 약 처방' },
    ],
  },
]
