import { apiFetch } from './httpClient'
import type { Role } from '../auth/roles'

// [STAFF-*·CAL-COLOR-*] /admin/staff 표시층의 얇은 클라이언트 — 경로·형태만 안다.
// 백엔드 계약: backend/app/routers/staff.py (Task 19a, prefix=/staff).
// ⚠️ 진료과는 schedule_admin 라우터(prefix=/admin)의 GET /admin/departments가 원본이다.
//    STAFF-INVITE-03: 사용 중인 진료과만 필요하므로 include_inactive=false로만 부른다.

/** GET /staff 한 줄. last_sign_in_at=null & is_active=true → 「초대중」(STAFF-LIST-08). */
export interface StaffMember {
  id: string
  name: string
  role: Role
  department_id: string | null
  is_active: boolean
  specialty: string | null
  bio: string | null
  photo_url: string | null
  /** 팔레트의 몇 번째(CAL-COLOR-09) — 색값이 아니라 인덱스. 의사만 값이 있다(CAL-COLOR-08). */
  calendar_color_index: number | null
  last_sign_in_at: string | null
  invited_at: string | null
}

/** GET /staff/{id}/deactivation-impact — 건수·날짜·시각만(이름·전화 없음, STAFF-DEACT-04). */
export interface DeactivationImpact {
  count: number
  times: { date: string; time: string }[]
  version: string
}

export interface Department {
  id: string
  name: string
  is_active: boolean
}

export interface InviteBody {
  email: string
  name: string
  role: Role
  department_id: string | null
}

export interface ProfilePatch {
  specialty?: string
  bio?: string
  photo_url?: string | null
  calendar_color_index?: number
}

export const staffApi = {
  list: () => apiFetch<StaffMember[]>('/staff'),

  /** STAFF-INVITE-03 — 사용 중인 진료과만. */
  departments: () => apiFetch<Department[]>('/admin/departments?include_inactive=false'),

  invite: (body: InviteBody) =>
    apiFetch<{ staff_id: string }>('/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  /** STAFF-ROW-01 — 별도 엔드포인트. 「계정이 살아났다」와 다른 동작이다. */
  resendInvite: (id: string) =>
    apiFetch<{ status: string }>(`/staff/${id}/resend-invite`, { method: 'POST' }),

  /** STAFF-PROFILE-04·CAL-COLOR-09 — 바뀐 칸만 보낸다(부분 저장). */
  updateProfile: (id: string, patch: ProfilePatch) =>
    apiFetch<{ status: string }>(`/staff/${id}/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),

  /** STAFF-PROFILE-06 — multipart. Content-Type은 브라우저가 boundary와 함께 붙인다. */
  uploadPhoto: (id: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiFetch<{ photo_url: string }>(`/staff/${id}/photo`, { method: 'POST', body: form })
  },

  deletePhoto: (id: string) =>
    apiFetch<{ status: string }>(`/staff/${id}/photo`, { method: 'DELETE' }),

  deactivationImpact: (id: string) =>
    apiFetch<DeactivationImpact>(`/staff/${id}/deactivation-impact`),

  /** STAFF-DEACT-09 — 미리보기 version을 함께 보낸다. 불일치면 서버가 409. */
  deactivate: (id: string, impactVersion: string | null) =>
    apiFetch<{ status: string }>(`/staff/${id}/deactivate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ impact_version: impactVersion }),
    }),
}
