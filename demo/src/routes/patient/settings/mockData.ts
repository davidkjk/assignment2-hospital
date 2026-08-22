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

function buildHistoryAppointment(index: number, patient: Patient, seed: number): HistoryAppointment {
  // seed(사람 순번)로 과·상태·날짜를 어긋나게 해 사람마다 이력 내용이 다르게 보이도록 한다.
  // 최근 몇 건만 2026년, 나머지는 2025년으로 — 이력이 짧은 사람(어머니 등)도 두 해에 걸쳐
  // '연도 바로가기'가 보이게 한다(A-2).
  const date =
    index < 5
      ? new Date(2026, 7, 19 - index - seed * 3)
      : new Date(2025, 11, 18 - (index - 5) * 7 - seed * 5)
  const [deptName, doctorName] = departmentPattern[(index + seed) % departmentPattern.length]
  const status = statusPattern[(index + seed * 2) % statusPattern.length]
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

// 사람마다 건수를 달리해(본인 많이·가족 적게) 칩을 바꾸면 목록이 확연히 달라지게 한다.
// 본인은 20건 이어받기 데모를 위해 25건 유지. 아들은 '수정 가능(진료 이력 0)' 예시라 이력 0으로 맞춘다(FAM-EDIT-03/08 정합).
const HISTORY_COUNT: Record<string, number> = { 'p-self': 25, 'p-mom': 9, 'p-son': 0 }

/** 최근 20건 뒤에 이어 받을 수 있도록 사람별로 준비한 데모 이력 데이터. */
export const historyAppointments: HistoryAppointment[] = patients
  .flatMap((patient, seed) =>
    Array.from({ length: HISTORY_COUNT[patient.id] ?? 6 }, (_, index) => ({
      ...buildHistoryAppointment(index, patient, seed),
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
