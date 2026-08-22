export type DoctorQueueStatus = '도착' | '진료 대기' | '진료 중' | '진료 완료'

export interface DoctorPatient {
  id: string
  order: number
  name: string
  birth: string
  sex: '남' | '여'
  waitMinutes: number
  time: string
  department: string
  doctor: string
  status: DoctorQueueStatus
  reason: string
  attention?: string
  questionnaire: { question: string; answer: string }[]
  notes: { content: string; author: string; at: string }[]
  histories: { date: string; department: string; doctor: string; summary: string }[]
}

export const doctorQueue: DoctorPatient[] = [
  {
    id: 'dp1',
    order: 1,
    name: '김태호',
    birth: '1972-11-03',
    sex: '남',
    waitMinutes: 38,
    time: '09:05',
    department: '내과',
    doctor: '이정훈',
    status: '진료 중',
    reason: '최근 혈압이 높게 측정되고 머리가 무겁습니다.',
    questionnaire: [
      { question: '증상은 언제부터 시작됐나요?', answer: '3일 전부터 머리가 무겁고 어지러웠습니다.' },
      { question: '현재 복용 중인 약이 있나요?', answer: '혈압약을 아침에 복용합니다.' },
      { question: '알레르기가 있나요?', answer: '없습니다.' },
    ],
    notes: [
      { content: '크게 말해야 잘 들으십니다.', author: '박지민', at: '2026-06-10 10:18' },
    ],
    histories: [
      { date: '2026-06-10', department: '내과', doctor: '이정훈', summary: '고혈압 경과 관찰 · 기존 약 유지' },
      { date: '2026-03-02', department: '정형외과', doctor: '박강우', summary: '우측 어깨 회전근개 염좌' },
    ],
  },
  {
    id: 'dp2',
    order: 2,
    name: '한지아',
    birth: '1995-01-19',
    sex: '여',
    waitMinutes: 21,
    time: '09:20',
    department: '내과',
    doctor: '이정훈',
    status: '진료 대기',
    reason: '기침과 콧물이 있고 목이 따갑습니다.',
    questionnaire: [
      { question: '증상은 언제부터 시작됐나요?', answer: '어제 아침부터입니다.' },
      { question: '열이 나나요?', answer: '37.4도까지 측정됐습니다.' },
    ],
    notes: [],
    histories: [
      { date: '2025-12-11', department: '내과', doctor: '이정훈', summary: '급성 인두염 · 3일분 약 처방' },
    ],
  },
  {
    id: 'dp3',
    order: 3,
    name: '문상호',
    birth: '1968-10-11',
    sex: '남',
    waitMinutes: 8,
    time: '09:40',
    department: '내과',
    doctor: '이정훈',
    status: '도착',
    reason: '정기 검사 결과 상담',
    attention: '보행 시 부축 필요',
    questionnaire: [],
    notes: [
      { content: '보호자와 함께 설명해 주세요.', author: '김서연', at: '2026-08-10 14:05' },
    ],
    histories: [],
  },
]

export const quickPhrases = [
  { label: '특이 소견 없음', text: '진찰상 특이 소견은 관찰되지 않음.' },
  { label: '경과 관찰', text: '약물 복용 후 증상 변화를 관찰하도록 안내함.' },
  { label: '악화 시 내원', text: '증상이 악화되거나 새로운 증상이 생기면 다시 내원하도록 안내함.' },
  { label: '약 복용 안내', text: '처방약은 용법과 용량에 따라 복용하도록 설명함.' },
]
