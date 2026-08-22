export type CardStatus =
  | '예약신청'
  | '예약확정'
  | '도착'
  | '진료대기'
  | '진료중'
  | '진료완료'
  | '환자취소'
  | '병원취소'
  | '예약부도'
  | '미확정'

export type DemoAppointment = {
  id: string
  patientName: string
  relation: string
  date: string
  time: string
  department: string
  doctor: string
  reference: string
  status: CardStatus
  bookingCode?: string
  queueAhead?: number
  waitMinutes?: number
  changeFrom?: string
  changeTo?: string
  /** 사전문진 상태·진행률(있으면 문진 줄을 실제 상태로 그린다. 없으면 상태 기본값). */
  questionnaireStatus?: '미작성' | '작성중' | '작성완료'
  questionnaireProgress?: { answered: number; total: number }
}

/** 시연·QA에서 한 화면에 확인할 수 있는 예약 카드 10종이다. */
export const demoAppointments: DemoAppointment[] = [
  {
    id: 'gallery-request',
    patientName: '김순자',
    relation: '본인',
    date: '2026-08-22',
    time: '09:30',
    department: '내과',
    doctor: '이정훈',
    reference: 'S-2413',
    status: '예약신청',
  },
  {
    id: 'gallery-confirmed',
    patientName: '박말순',
    relation: '어머니',
    date: '2026-08-22',
    time: '16:00',
    department: '안과',
    doctor: '오세림',
    reference: 'A-2414',
    status: '예약확정',
    bookingCode: '241401',
    changeFrom: '14:00',
    changeTo: '16:00',
  },
  {
    id: 'gallery-arrived',
    patientName: '김민준',
    relation: '아들',
    date: '2026-08-22',
    time: '10:00',
    department: '정형외과',
    doctor: '박강우',
    reference: 'A-2415',
    status: '도착',
    bookingCode: '241502',
  },
  {
    id: 'gallery-waiting',
    patientName: '김순자',
    relation: '본인',
    date: '2026-08-22',
    time: '11:00',
    department: '내과',
    doctor: '한서연',
    reference: 'A-2416',
    status: '진료대기',
    bookingCode: '241603',
    queueAhead: 3,
    waitMinutes: 25,
  },
  {
    id: 'gallery-in-care',
    patientName: '박말순',
    relation: '어머니',
    date: '2026-08-22',
    time: '11:30',
    department: '안과',
    doctor: '오세림',
    reference: 'A-2417',
    status: '진료중',
    bookingCode: '241704',
  },
  {
    id: 'gallery-completed',
    patientName: '김순자',
    relation: '본인',
    date: '2026-08-22',
    time: '09:00',
    department: '내과',
    doctor: '이정훈',
    reference: 'A-2418',
    status: '진료완료',
  },
  {
    id: 'gallery-patient-cancelled',
    patientName: '김민준',
    relation: '아들',
    date: '2026-08-22',
    time: '13:00',
    department: '정형외과',
    doctor: '최다인',
    reference: 'A-2419',
    status: '환자취소',
  },
  {
    id: 'gallery-hospital-cancelled',
    patientName: '박말순',
    relation: '어머니',
    date: '2026-08-22',
    time: '13:30',
    department: '안과',
    doctor: '오세림',
    reference: 'A-2420',
    status: '병원취소',
  },
  {
    id: 'gallery-late',
    patientName: '김순자',
    relation: '본인',
    date: '2026-08-22',
    time: '14:00',
    department: '내과',
    doctor: '한서연',
    reference: 'A-2421',
    status: '예약부도',
    bookingCode: '242105',
  },
  {
    id: 'gallery-unconfirmed',
    patientName: '김민준',
    relation: '아들',
    date: '2026-08-22',
    time: '15:00',
    department: '정형외과',
    doctor: '박강우',
    reference: 'S-2422',
    status: '미확정',
  },
]

export type NotificationKind =
  | 'booking'
  | 'reminder'
  | 'change'
  | 'cancel'
  | 'questionnaire'
  | 'chat'
  | 'aftercare'
  | 'gone'

export type NotificationTarget =
  | { type: 'route'; path: string }
  | { type: 'gone' }

export type NotificationItem = {
  id: string
  groupLabel: string
  kind: NotificationKind
  title: string
  patientName: string
  message: string
  time: string
  read: boolean
  important?: boolean
  target: NotificationTarget
}

/** 알림함 목업 데이터. 앱에 들어오면 읽음 여부는 화면 로컬 상태로 갱신한다. */
export const initialNotifications: NotificationItem[] = [
  {
    id: 'notification-1',
    groupLabel: '오늘',
    kind: 'booking',
    title: '예약이 확정되었어요',
    patientName: '김순자',
    message: '예약이 확정되었습니다',
    time: '오전 9:10',
    read: false,
    target: { type: 'route', path: '/appt/appt-1' },
  },
  {
    id: 'notification-2',
    groupLabel: '오늘',
    kind: 'change',
    title: '예약 시간이 변경되었어요',
    patientName: '박말순',
    message: '병원 사정으로 예약 시간이 변경되었습니다',
    time: '오전 8:42',
    read: false,
    important: true,
    target: { type: 'route', path: '/appt/appt-2' },
  },
  {
    id: 'notification-3',
    groupLabel: '오늘',
    kind: 'questionnaire',
    title: '사전문진을 작성해 주세요',
    patientName: '박말순',
    message: '진료 전 사전문진을 작성할 수 있습니다',
    time: '오전 7:30',
    read: true,
    target: { type: 'route', path: '/questionnaire' },
  },
  {
    id: 'notification-4',
    groupLabel: '어제',
    kind: 'reminder',
    title: '내일 예약이 있어요',
    patientName: '김순자',
    message: '예약 하루 전 안내입니다',
    time: '오후 6:00',
    read: true,
    target: { type: 'route', path: '/appt/appt-1' },
  },
  {
    id: 'notification-5',
    groupLabel: '어제',
    kind: 'chat',
    title: '상담 답변이 도착했어요',
    patientName: '김순자',
    message: '상담방에 새로운 답변이 있습니다',
    time: '오후 3:20',
    read: false,
    target: { type: 'route', path: '/chat' },
  },
  {
    id: 'notification-6',
    groupLabel: '8월 18일',
    kind: 'cancel',
    title: '예약이 취소되었어요',
    patientName: '박말순',
    message: '병원 사정으로 예약이 취소되었습니다',
    time: '오전 10:15',
    read: true,
    important: true,
    target: { type: 'route', path: '/history' },
  },
  {
    id: 'notification-7',
    groupLabel: '8월 17일',
    kind: 'gone',
    title: '예약을 확인해 주세요',
    patientName: '김민준',
    message: '이 예약의 상세 내용을 확인할 수 있습니다',
    time: '오후 2:05',
    read: false,
    target: { type: 'gone' },
  },
]
