import { apiFetch } from './httpClient'

// 등록 문(SHELL-DOOR-03)의 얇은 클라이언트 — 경로·본문만 안다. 오류·오프라인·세션은 httpClient가 지킨다.
// 백엔드 계약: backend/app/routers/patients.py (POST /patients · GET /patients/duplicate-check)

/** 신원 폼 본문 — 이름·성별·생년월일·전화. 검색칸·담당의사는 폼에서 뺀다(SHELL-DOOR-03). */
export interface RegisterPatientBody {
  name: string
  gender: string
  /** "YYYY-MM-DD" — 화면의 8자리 자동서식을 ISO 날짜로 옮겨 보낸다. */
  birth_date: string
  phone: string
}

/** 등록하면 새 환자 고유번호를 돌려준다 — 화면은 이걸로 [예약 잡기]·[바로 접수]로 잇는다. */
export function registerPatient(body: RegisterPatientBody) {
  return apiFetch<{ patient_id: string }>('/patients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** 소프트 중복 후보 — 겹치는 기록이 없으면 세 칸 모두 null.
 *  ⭐ 표시값은 **서버가 가려서** 준다(`MASK-SRV-01`) — 화면이 다시 가리지 않는다. */
export interface DuplicateCandidate {
  patient_id: string | null
  /** 김*정 (`MASK-SRV-01`) */
  name: string | null
  /** 1975-**-20 (`MASK-DOB-01`) */
  masked_birth_date: string | null
}

// 소프트 중복 "혹시 이분?"(SHELL-DOOR-03) — 전화·생일이 강하게 겹치는 기존 기록.
// ⛔ 막지 않는다 — 후보를 알려줄 뿐 등록을 거부하지 않는다(개인정보 열거 방지·막다른 길 금지).
export function checkDuplicate(phone: string, birthDate: string) {
  const params = new URLSearchParams({ phone, birth_date: birthDate })
  return apiFetch<DuplicateCandidate>(`/patients/duplicate-check?${params.toString()}`)
}
