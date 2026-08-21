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

export type Appointment = {
  id: string
  patientName: string
  deptName: string
  doctorName: string
  date: string // 'YYYY-MM-DD'
  time: string // 'HH:MM'
  status: AppointmentStatus
  hasQR: boolean
}
