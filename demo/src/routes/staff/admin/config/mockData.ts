export type StaffRole = '접수직원' | '의사' | '관리자'
export type StaffStatus = '활성' | '휴직' | '정지'

export interface StaffMember {
  id: string
  name: string
  email: string
  role: StaffRole
  department: string
  status: StaffStatus
  lastLogin: string
  invitePending?: boolean
  affectedAppointments?: { date: string; time: string }[]
}

export const staffMembers: StaffMember[] = [
  { id: 's1', name: '김민지', email: 'minji@saebom.test', role: '관리자', department: '운영팀', status: '활성', lastLogin: '오늘 08:42' },
  { id: 's2', name: '이정훈', email: 'jhlee@saebom.test', role: '의사', department: '내과', status: '활성', lastLogin: '오늘 08:57', affectedAppointments: [{ date: '8월 25일(화)', time: '10:00' }, { date: '8월 25일(화)', time: '10:30' }, { date: '8월 27일(목)', time: '14:00' }] },
  { id: 's3', name: '한서연', email: 'syhan@saebom.test', role: '의사', department: '내과', status: '활성', lastLogin: '어제 17:26', affectedAppointments: [{ date: '8월 26일(수)', time: '09:30' }] },
  { id: 's4', name: '박강우', email: 'kwpark@saebom.test', role: '의사', department: '정형외과', status: '휴직', lastLogin: '8월 6일 16:10' },
  { id: 's5', name: '최유진', email: 'yjchoi@saebom.test', role: '접수직원', department: '접수', status: '활성', lastLogin: '초대 보냄 · 8월 20일', invitePending: true },
  { id: 's6', name: '오지현', email: 'jhoh@saebom.test', role: '접수직원', department: '접수', status: '정지', lastLogin: '7월 28일 18:04' },
]

export const scheduleDoctors = [
  { id: 'd1', name: '이정훈', department: '내과' },
  { id: 'd2', name: '한서연', department: '내과' },
  { id: 'd3', name: '윤지호', department: '피부과' },
  { id: 'd4', name: '박강우', department: '정형외과' },
]

export const weekDays = ['월', '화', '수', '목', '금', '토', '일'] as const

export const weeklySchedule = scheduleDoctors.map((doctor, doctorIndex) => ({
  doctor,
  days: weekDays.map((day, dayIndex) => ({
    day,
    closed: dayIndex === 6 || (doctorIndex === 2 && dayIndex === 3),
    hours: dayIndex === 5 ? '09:00–13:00' : '09:00–18:00',
    slot: doctorIndex === 3 ? 30 : 15,
    capacity: dayIndex === 5 ? 20 : 40,
  })),
}))

export type QuestionType = '단답형' | '장문형' | '예/아니오'
export type QuestionAudience = '모든 환자' | '여성 환자만' | '남성 환자만'

export interface QuestionnaireQuestion {
  id: string
  text: string
  type: QuestionType
  requiredReview: boolean
  audience: QuestionAudience
}

export const questionnaireDepartments = [
  { id: 'internal', name: '내과', version: 3, questions: 5 },
  { id: 'derma', name: '피부과', version: 2, questions: 4 },
  { id: 'ortho', name: '정형외과', version: 4, questions: 6 },
  { id: 'family', name: '가정의학과', version: 0, questions: 0 },
]

export const initialQuestions: QuestionnaireQuestion[] = [
  { id: 'q-b78a', text: '오늘 가장 불편한 증상을 적어 주세요.', type: '장문형', requiredReview: true, audience: '모든 환자' },
  { id: 'q-21cf', text: '현재 복용 중인 약이 있나요?', type: '예/아니오', requiredReview: true, audience: '모든 환자' },
  { id: 'q-904d', text: '증상은 언제부터 시작됐나요?', type: '단답형', requiredReview: false, audience: '모든 환자' },
  { id: 'q-72ea', text: '임신 가능성이 있나요?', type: '예/아니오', requiredReview: true, audience: '여성 환자만' },
  { id: 'q-15cb', text: '최근 다른 병원에서 진료받았나요?', type: '예/아니오', requiredReview: false, audience: '모든 환자' },
]

export const questionnaireVersions = [
  { version: 3, savedAt: '2026-08-18 16:42', staff: '김민지', questions: 5, current: true },
  { version: 2, savedAt: '2026-07-02 11:08', staff: '김민지', questions: 4, current: false },
  { version: 1, savedAt: '2026-05-14 09:25', staff: '직원 정보 없음', questions: 3, current: false },
]

export const notificationRows = [
  { id: 'confirmed', label: '예약 확정', body: '{환자 이름}님, {날짜} {시각} 예약이 확정됐습니다.', sms: true },
  { id: 'reminder', label: '하루 전 알림', body: '{환자 이름}님, 내일 {시각} 예약이 있습니다.', sms: true },
  { id: 'changed', label: '예약 변경', body: '예약 시간이 {날짜} {시각}으로 변경됐습니다.', sms: true },
  { id: 'questionnaire', label: '문진 미작성', body: '방문 전 문진을 작성해 주세요.', sms: false },
  { id: 'completed', label: '진료 완료', body: '오늘 진료가 완료됐습니다.', sms: false },
]
