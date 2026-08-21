import { initialAppointments, patients } from '@/mock/data'
import type { Patient } from '@/mock/types'

export type HistoryStatus = '진료완료' | '환자취소' | '병원취소' | '예약부도' | '미확정'

export type QuestionnaireAnswer = {
  question: string
  answer: string
}

export type HistoryAppointment = {
  id: string
  patientId: string
  patientName: string
  date: string
  time: string
  deptName: string
  doctorName: string
  status: HistoryStatus
  statusAt?: string
  note?: string
  questionnaire?: QuestionnaireAnswer[]
}

const statusPattern: HistoryStatus[] = [
  '진료완료',
  '진료완료',
  '환자취소',
  '병원취소',
  '예약부도',
  '미확정',
]

const departmentPattern = [
  ['내과', '이정훈'],
  ['정형외과', '박강우'],
  ['안과', '오세림'],
  ['이비인후과', '정우재'],
]

function toISO(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function buildHistoryAppointment(index: number, patient: Patient): HistoryAppointment {
  const date = index < 20 ? new Date(2026, 7, 19 - index) : new Date(2025, 11, 18 - (index - 20) * 7)
  const [deptName, doctorName] = departmentPattern[index % departmentPattern.length]
  const status = statusPattern[index % statusPattern.length]
  const dateValue = toISO(date)
  const hasNote = status === '진료완료' && index % 3 !== 1
  const hasQuestionnaire = status === '진료완료' && index % 2 === 0

  return {
    id: `history-${String(index + 1).padStart(2, '0')}`,
    patientId: patient.id,
    patientName: patient.name,
    date: dateValue,
    time: index % 2 === 0 ? '09:30' : '14:00',
    deptName,
    doctorName,
    status,
    statusAt: status === '환자취소' || status === '병원취소' ? `${dateValue}T15:12` : undefined,
    note: hasNote ? '다음 방문 전까지 처방받은 약을 복용하고, 증상이 계속되면 병원으로 연락해 주세요.' : undefined,
    questionnaire: hasQuestionnaire
      ? [
          { question: '오늘 어디가 불편하신가요?', answer: index % 4 === 0 ? '허리와 무릎이 불편합니다.' : '속이 더부룩합니다.' },
          { question: '증상은 며칠 됐나요?', answer: index % 4 === 0 ? '일주일 정도' : '3일 정도' },
        ]
      : undefined,
  }
}

/** 최근 20건 뒤에 이어 받을 수 있도록 25건을 준비한 데모 이력 데이터. */
export const historyAppointments: HistoryAppointment[] = patients
  .flatMap((patient) =>
    Array.from({ length: 25 }, (_, index) => ({
      ...buildHistoryAppointment(index, patient),
      id: `history-${patient.id}-${String(index + 1).padStart(2, '0')}`,
    })),
  )
  .sort((left, right) => right.date.localeCompare(left.date))

export type SettingsItem = {
  id: 'notifications' | 'password' | 'hospital' | 'withdraw'
  label: string
  description: string
  path: string
}

export const settingsItems: SettingsItem[] = [
  {
    id: 'notifications',
    label: '알림 설정',
    description: '받을 알림을 고를 수 있습니다',
    path: '/settings/notifications',
  },
  {
    id: 'password',
    label: '비밀번호 변경',
    description: '새 비밀번호를 설정합니다',
    path: '/settings/password',
  },
  {
    id: 'hospital',
    label: '병원 정보',
    description: '전화·주소·길찾기',
    path: '/settings/hospital',
  },
  {
    id: 'withdraw',
    label: '회원 탈퇴',
    description: '탈퇴 전 보관 안내를 확인합니다',
    path: '/settings/withdraw',
  },
]

export const accountSnapshot = {
  name: '김순자',
  phone: '010-1234-5678',
}

export const hospitalInfo = {
  name: '한빛병원',
  phone: '02-1234-5678',
  address: '서울특별시 강남구 테헤란로 123',
  mapUrl: 'https://maps.google.com/?q=%ED%95%9C%EB%B9%9B%EB%B3%91%EC%9B%90',
}

export const notificationGroups = [
  {
    id: 'appointments',
    title: '예약에 관한 알림',
    items: [
      { id: 'appointment-changed', label: '예약 변경·취소 안내', important: true },
      { id: 'appointment-requested', label: '예약 신청·확정 안내', important: false },
      { id: 'appointment-reminder', label: '예약 전날·당일 안내', important: false },
    ],
  },
  {
    id: 'other',
    title: '그 밖의 알림',
    items: [
      { id: 'questionnaire', label: '사전문진 안내', important: false },
      { id: 'after-visit', label: '진료 후 안내', important: false },
      { id: 'chat-reply', label: '상담 답변', important: false },
    ],
  },
] as const

export const withdrawalPolicy = {
  hasUpcomingAppointments: initialAppointments.length > 0,
  archiveNotice: '탈퇴하셔도 진료기록은 의료법에 따라 병원에 안전하게 보관됩니다.',
}
