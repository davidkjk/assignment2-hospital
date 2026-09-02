import { describe, it, expect } from 'vitest'
import { resolveAdminBotNav } from './adminBotNav'

// 관리자 상담봇 화면 사이 내비 계약(NAV-ADM-*). 도착 화면(KBADM=Task20 · UNRES/BADINBOX/QUALITY=Task21
// · STAT drill=코2)은 계열명으로만 참조하고 재구현하지 않는다 — 이 순수 함수는 라우팅·보존 규칙만 소유한다.

describe('adminBotNav (NAV-ADM-*)', () => {
  it('[NAV-ADM-01] 안내자료 목록의 [새 안내자료]는 편집 화면으로 가되 저장만으로 공개하지 않는다', () => {
    const r = resolveAdminBotNav('kb-list', 'new-kb')
    expect(r).toMatchObject({ to: 'kb-editor', publishesOnSave: false })
  })

  it('[NAV-ADM-02] 안내자료 행 선택은 수정 화면으로 간다(대상 조회 실패 시 새 자료로 전환하지 않음)', () => {
    const r = resolveAdminBotNav('kb-list', 'open-kb-row')
    expect(r).toMatchObject({ to: 'kb-editor' })
    // publishesOnSave 미표시 = 새 자료 강제 전환 계약 없음
    expect((r as { publishesOnSave?: boolean }).publishesOnSave).toBeUndefined()
  })

  it('[NAV-ADM-03] 편집의 [수정이력 보기]는 이력으로 가고 뒤로 가면 같은 자료 편집으로 돌아온다', () => {
    expect(resolveAdminBotNav('kb-editor', 'open-history')).toMatchObject({ to: 'kb-history' })
  })

  it('[NAV-ADM-04] 이전 버전 [편집]은 편집 폼으로 가되 별도 승인 필요(자동 승인·승인 취소 아님)', () => {
    expect(resolveAdminBotNav('kb-history', 'edit-prev-version')).toMatchObject({ to: 'kb-editor', approvalRequired: true })
  })

  it('[NAV-ADM-05] 미해결 질문 상세의 안내자료 추가는 편집으로 가고 승인 성공 뒤에만 반영된다', () => {
    expect(resolveAdminBotNav('unresolved-detail', 'add-kb')).toMatchObject({ to: 'kb-editor', approvalRequired: true })
  })

  it('[NAV-ADM-06] 오답 신고 상세의 [반영]은 자료 수정/예시 추가로 가되 자동 승인하지 않는다', () => {
    expect(resolveAdminBotNav('badinbox-detail', 'apply-report')).toMatchObject({ to: 'kb-editor', approvalRequired: true })
  })

  it('[NAV-ADM-07] 품질 리포트 교정 저장은 source=quality_review가 등록된 오답 신고 처리함으로 간다', () => {
    expect(resolveAdminBotNav('quality-detail', 'save-correction')).toMatchObject({ to: 'badinbox', approvalRequired: true })
  })

  it('[NAV-ADM-08] 전체 질문 순위 상세의 FAQ 보강은 안내자료 작성으로 가되 승인 전 미반영', () => {
    expect(resolveAdminBotNav('ranking-detail', 'faq-boost')).toMatchObject({ to: 'kb-editor', approvalRequired: true })
  })

  it('[NAV-ADM-09] 계약 있는 숫자 카드는 같은 기간 상세로 가고 닫으면 기간·지표를 유지한다', () => {
    expect(resolveAdminBotNav('botstats', 'open-metric-card', { cardState: 'has_contract' }))
      .toMatchObject({ to: 'botstats-drill', preserve: { period: true } })
  })

  it('[NAV-ADM-10] 계약 없음·오류·오프라인 카드는 상세/CSV로 이동하지 않고 현재 상태·재시도를 유지한다', () => {
    for (const cardState of ['no_contract', 'error', 'offline'] as const) {
      const r = resolveAdminBotNav('botstats', 'open-metric-card', { cardState })
      expect(r.to).toBeNull()
      expect((r as { retry: boolean }).retry).toBe(true)
    }
  })

  it('[NAV-ADM-11] 운영시간 화면의 특정 날짜 선택은 같은 화면의 특정일 변경 상세로 간다', () => {
    expect(resolveAdminBotNav('hours', 'select-date')).toMatchObject({ to: 'hours-day' })
  })

  it('[NAV-ADM-12] 관리자 화면의 목록 복귀는 필터·스크롤 보존을 임의로 확정하지 않고 확인 필요로 남긴다', () => {
    const r = resolveAdminBotNav('badinbox', 'back-to-list') as { preserve: { filters: unknown; scroll: unknown } }
    expect(r.preserve.filters).toBe('unknown')
    expect(r.preserve.scroll).toBe('unknown')
  })
})
