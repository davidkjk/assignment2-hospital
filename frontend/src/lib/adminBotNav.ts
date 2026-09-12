// 관리자 상담봇 화면 사이 내비 계약(NAV-ADM-*). 순수 함수 — 라우팅·보존 규칙만 소유하고
// 도착 화면(KBADM=Task20 · UNRES/BADINBOX/QUALITY=Task21 · STAT drill=코2)은 재구현하지 않는다.
export type AdminBotScreen =
  | 'kb-list' | 'kb-editor' | 'kb-history'        // 안내자료(KBADM 계열=Task20)
  | 'unresolved-detail' | 'badinbox' | 'badinbox-detail'
  | 'quality-detail' | 'ranking-detail'
  | 'botstats' | 'botstats-drill'                 // 상담봇 처리 현황(이 태스크)
  | 'hours' | 'hours-day'                         // 운영시간(SCHED 계열=코2)

export type NavAction =
  | 'new-kb' | 'open-kb-row' | 'open-history' | 'edit-prev-version'
  | 'add-kb' | 'apply-report' | 'save-correction' | 'faq-boost'
  | 'open-metric-card' | 'select-date' | 'back-to-list'

// 보존 계약: 근거가 확실한 것만 true, 근거 없으면 "unknown"(임의 확정 안 함, NAV-ADM-12/정본 §4).
export type Preserve = { filters?: boolean | 'unknown'; scroll?: boolean | 'unknown'; period?: boolean }
export type NavGo = { to: AdminBotScreen; approvalRequired?: boolean; publishesOnSave?: boolean; preserve: Preserve }
export type NavStay = { to: null; reason: string; retry: true } // 이동 안 함(계약없음/오류/오프라인)
export type NavResult = NavGo | NavStay

// 숫자 카드의 상세 계약 상태
export type CardState = 'has_contract' | 'no_contract' | 'error' | 'offline'

export function resolveAdminBotNav(
  from: AdminBotScreen,
  action: NavAction,
  opts: { cardState?: CardState } = {},
): NavResult {
  switch (action) {
    case 'new-kb':            return { to: 'kb-editor', publishesOnSave: false, preserve: {} }            // NAV-ADM-01
    case 'open-kb-row':       return { to: 'kb-editor', preserve: {} }                                    // NAV-ADM-02 (대상 조회 실패해도 새 자료로 전환은 화면 몫)
    case 'open-history':      return { to: 'kb-history', preserve: {} }                                   // NAV-ADM-03 (뒤로=같은 자료 편집)
    case 'edit-prev-version': return { to: 'kb-editor', approvalRequired: true, preserve: {} }            // NAV-ADM-04 (자동 승인·승인 취소 아님)
    case 'add-kb':            return { to: 'kb-editor', approvalRequired: true, preserve: {} }            // NAV-ADM-05 (승인 성공 뒤에만 반영)
    case 'apply-report':      return { to: 'kb-editor', approvalRequired: true, preserve: {} }            // NAV-ADM-06 (자동 승인 금지)
    case 'save-correction':   return { to: 'badinbox', approvalRequired: true, preserve: {} }            // NAV-ADM-07 (source=quality_review 등록된 처리함)
    case 'faq-boost':         return { to: 'kb-editor', approvalRequired: true, preserve: {} }            // NAV-ADM-08 (승인 전 미반영)
    case 'open-metric-card':                                                                              // NAV-ADM-09/10
      if (opts.cardState === 'has_contract') return { to: 'botstats-drill', preserve: { period: true } } // 닫으면 기간·지표 유지
      return { to: null, reason: opts.cardState ?? 'no_contract', retry: true }                          // 계약없음/오류/오프라인 → 이동 안 함
    case 'select-date':       return { to: 'hours-day', preserve: {} }                                    // NAV-ADM-11 (같은 화면 특정일 상세)
    case 'back-to-list':                                                                                  // NAV-ADM-12
      return { to: from, preserve: { filters: 'unknown', scroll: 'unknown' } }                            // 근거 없어 화면별 확인 필요
  }
}
