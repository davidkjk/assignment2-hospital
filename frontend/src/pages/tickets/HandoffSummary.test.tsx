import { it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HandoffSummary } from './HandoffSummary'

const full = {
  patientAsked: '두통약 정보',
  botConfirmed: '타이레놀 안내함',
  alreadyGuided: '복용법 안내',
  unresolvedReason: '용량 초과 문의',
  staffShouldCheck: '기저질환 확인',
}

it('[TICKET-DETAIL-SUM-01] 요약 5항목을 라벨과 함께 모두 표시한다', () => {
  render(<HandoffSummary summary={full} assignee={null} />)
  for (const label of ['환자가 궁금해한 내용', '상담봇이 확인한 정보', '이미 안내한 내용', '해결되지 않은 이유', '직원이 확인할 사항']) {
    expect(screen.getByText(label)).toBeInTheDocument()
  }
  expect(screen.getByText('두통약 정보')).toBeInTheDocument()
})

it('[TICKET-DETAIL-SUM-02] 항목 값이 비면 없는 내용을 만들어 채우지 않고 없음을 표시한다', () => {
  render(<HandoffSummary summary={{ ...full, unresolvedReason: null, staffShouldCheck: null }} assignee={null} />)
  expect(screen.getAllByText('없음')).toHaveLength(2) // 빈 두 항목만 없음(나머지는 실제 값)
})

it('[TICKET-DETAIL-ASSIGN-01] in_progress면 현재 배정 직원의 이름과 역할을 표시한다', () => {
  render(<HandoffSummary summary={full} assignee={{ name: '박접수', role: 'reception' }} />)
  expect(screen.getByText('담당: 박접수 · 접수')).toBeInTheDocument()
})
