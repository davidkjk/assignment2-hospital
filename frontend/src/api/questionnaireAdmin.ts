import { apiFetch } from './httpClient'

// [QADM-*] /admin/questionnaires 표시층의 얇은 클라이언트 — 경로·형태만 안다.
// 백엔드 계약: backend/app/routers/questionnaire_admin.py (Task 22a, prefix=/admin/questionnaires).
// ⭐ 저장은 덮어쓰기가 아니라 새 불변 버전을 만든다(결정12) — POST .../versions 하나뿐이고
//    PUT·DELETE는 백엔드에 아예 없다(AD-065·066). 이 파일에도 만들지 않는다.
// ⛔ 답변을 읽는 창구를 두지 않는다(결정#14) — 관리자는 양식만 다룬다.

/** 환자 앱이 그릴 수 있는 입력칸만 — 관리자가 고를 수 있는 종류와 앱이 그리는 종류를 같은 값으로 묶는다(QADM-FORM-05). */
export const QUESTION_TYPES = ['short_text', 'long_text', 'yes_no'] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]

/** 실제 노출은 진료받는 사람(for_patient_id)의 성별로 앱이 판단한다 — 여기선 조건만 저장(QADM-FORM-07). */
export const SHOW_TO = ['all', 'female', 'male'] as const
export type ShowTo = (typeof SHOW_TO)[number]

export const MAX_QUESTIONS = 30

export interface Question {
  id: string
  text: string
  type: QuestionType
  /** 「병원이 꼭 확인」 — 환자 입력을 막는 뜻이 아니라 의사 화면에 확인 필요 표시(QADM-FORM-06). */
  required: boolean
  show_to: ShowTo
}

/** 왼쪽 진료과 목록 한 줄. active_version은 현재 사용 중 버전 번호(없으면 null). */
export interface DepartmentSummary {
  id: string
  name: string
  active_version: number | null
  question_count: number
}

/** 오른쪽 버전 기록 한 줄 — 번호·시각·직원·문항 수로만 식별(QADM-VERSION-03). 답변 수는 안 끌어온다. */
export interface VersionSummary {
  id: string
  version_no: number
  is_active: boolean
  created_at: string
  created_by_name: string
  question_count: number
}

/** 지금 환자가 보는 현재 버전. 없으면(첫 저장 전) null. */
export interface ActiveVersion {
  id: string
  version_no: number
  questions: Question[]
}

export interface DepartmentForm {
  department_id: string
  department_name: string
  active_version: ActiveVersion | null
  versions: VersionSummary[]
}

/** 저장 성공(201)·버전 상세 조회가 함께 쓰는 한 버전의 전체 모습. */
export interface SavedVersion {
  id: string
  department_id: string
  version_no: number
  is_active: boolean
  created_at: string
  created_by_name: string
  questions: Question[]
}

export interface SaveVersionBody {
  questions: Question[]
  /** 낙관적 충돌 판정 기준 — 편집을 시작한 현재 버전. 첫 저장은 null(QADM-SAVE-05). */
  base_version_id: string | null
}

export const questionnaireAdmin = {
  listDepartments: () => apiFetch<DepartmentSummary[]>('/admin/questionnaires'),

  getForm: (departmentId: string) =>
    apiFetch<DepartmentForm>(`/admin/questionnaires/${departmentId}`),

  saveVersion: (departmentId: string, body: SaveVersionBody) =>
    apiFetch<SavedVersion>(`/admin/questionnaires/${departmentId}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  getVersion: (versionId: string) =>
    apiFetch<SavedVersion>(`/admin/questionnaires/versions/${versionId}`),
}
