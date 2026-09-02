import type { KbStatus } from '../../../api/kbAdmin'

// KB 분류 — 승인 자료뿐(위치·주차·예약규칙·검사준비·FAQ). ⭐ 진료과·의사 소개, 진료시간·휴진일은 넣지 않는다
// (정본 §1(7~8)·KBADM-LIST-02·EDITOR-02): 의사 소개=staff.specialty·bio·photo_url, 진료시간=운영시간 원본에서 읽는다.
export const KB_CATEGORIES = ['위치·주차', '예약·변경·취소 규칙', '검사 전 준비사항', '자주 묻는 질문'] as const

// 기존 KB에 남아 있으면 재승인을 막고 원본 관리로 안내한다(EDITOR-17 — 중복 저장 금지).
export const EXCLUDED_CATEGORIES = ['진료과·의사 소개', '진료시간·휴진일'] as const

// ⭐ 제한 체크박스 이름은 글자 그대로(EDITOR-03) — 저장값 is_restricted. 답변 반영은 Task 7 RAG.
export const RESTRICTED_LABEL = '상담봇이 직접 답변하지 않고 이 문구만 그대로 보여줍니다'

// 상태 표시명 — ⚠️ 표시명·정렬은 서버 계약이 없어 확인 필요(LIST-03). enum 값(draft/approved/archived)만 백엔드에서 온다.
export const STATUS_LABELS: Record<KbStatus, string> = {
  draft: '초안',
  approved: '승인됨',
  archived: '보관',
}
