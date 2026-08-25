export type Role = 'receptionist' | 'doctor' | 'admin'

export interface StaffProfile {
  staffId: string
  name: string
  email: string
  role: Role
  departmentId: string | null
  departmentName: string | null
}

export const ROLE_LABEL: Record<Role, string> = {
  receptionist: '접수직원',
  doctor: '의사',
  admin: '관리자',
}

export function homeFor(role: Role): string {
  return role === 'doctor' ? '/doctor/console' : '/today'
}
