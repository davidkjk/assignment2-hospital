export type Patient = {
  id: string
  name: string
  /** '본인' 또는 관계('어머니'·'아들' 등) */
  relation: string
}

export type Department = {
  id: string
  name: string
}

export type Doctor = {
  id: string
  deptId: string
  name: string
  specialty: string
  /** 정기 진료시간 한 줄 요약 (BOOK-DOC-03) */
  scheduleSummary: string
  photoUrl?: string
}

export type Slot = {
  time: string // 'HH:MM'
  period: '오전' | '오후'
}

export type AppointmentStatus = '예약확정' | '예약신청' | '진료대기' | '접수완료'

/**
 * 사전문진 작성 상태(CARD-QNR-01·02 · LIST-QNR-01·02·03). 값이 없으면 문진 줄을 그리지 않는다.
 * '작성중'이면 진행률(questionnaireProgress)을 함께 보여 준다 — `사전문진 작성 중 (3/8) · 이어서 쓰기`.
 */
export type QuestionnaireStatus = '미작성' | '작성중' | '작성완료'

export type Appointment = {
  id: string
  patientName: string
  deptName: string
  doctorName: string
  date: string // 'YYYY-MM-DD'
  time: string // 'HH:MM'
  status: AppointmentStatus
  hasQR: boolean
  questionnaireStatus?: QuestionnaireStatus
  /**
   * 6자리 예약번호(booking_code). QR이 안 될 때 환자가 접수 데스크에 불러 주는 보조 경로.
   * 확정 전(예약신청)은 화면에서 '신청번호', 확정 후는 '예약번호'로 부른다(CARD-COMMON-02·03).
   * 방금 만든 신청은 아직 코드가 없을 수 있어 선택 필드로 둔다(없으면 번호 줄을 그리지 않는다).
   */
  bookingCode?: string
  /** '작성중'일 때 진행률. 예: { answered: 3, total: 8 } → `(3/8)` (LIST-QNR-03). */
  questionnaireProgress?: { answered: number; total: number }
}

/** 예약번호 라벨: 확정 전(예약신청)은 '신청번호', 그 외는 '예약번호'(CARD-COMMON-02·03). */
export function bookingCodeLabel(status: AppointmentStatus): '신청번호' | '예약번호' {
  return status === '예약신청' ? '신청번호' : '예약번호'
}
