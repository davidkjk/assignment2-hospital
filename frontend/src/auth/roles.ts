export type Role = 'receptionist' | 'doctor' | 'admin'

export const RECEPTION_AND_ADMIN = ['receptionist', 'admin'] as const satisfies readonly Role[]
export const ALL_STAFF = ['receptionist', 'doctor', 'admin'] as const satisfies readonly Role[]
export const ADMIN_ONLY = ['admin'] as const satisfies readonly Role[]

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
