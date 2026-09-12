import { describe, it, expect } from 'vitest'
import { resolveShellTitle } from './shellTitle'

// 헤더 제목 해석 — 정확 경로는 navItems label, 상세 화면(동적 경로)은 전용 제목, 나머지는 안전한 fallback.
describe('resolveShellTitle', () => {
  it('환자 상세(동적 경로)는 전용 제목을 준다', () => {
    expect(resolveShellTitle('/patients/abc-123')).toBe('환자 상세')
  })

  it('오답 신고 작성(동적 경로)은 navItems에 없어도 전용 제목을 준다(「직원 업무」 fallback 아님)', () => {
    expect(resolveShellTitle('/chatlog/report/msg-1')).toBe('오답 신고 작성')
  })

  it('navItems에 있는 정확 경로는 그 항목 label을 쓴다', () => {
    expect(resolveShellTitle('/tickets')).toBe('상담봇 문의함')
    expect(resolveShellTitle('/bot/overview')).toBe('상담봇 현황')
  })

  it('매칭되지 않는 경로는 안전한 fallback을 준다', () => {
    expect(resolveShellTitle('/totally-unknown')).toBe('직원 업무')
  })
})
