import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { LookupResultCard } from './LookupResultCard'
import { foundCard } from './testUtils'

function renderCard(over = {}, handlers: Partial<Parameters<typeof LookupResultCard>[0]> = {}) {
  const props = {
    result: foundCard(over),
    busy: false,
    actionError: null,
    onArrive: vi.fn(),
    onGoToQueue: vi.fn(),
    onRetry: vi.fn(),
    ...handlers,
  }
  render(<LookupResultCard {...props} />)
  return props
}

describe('LookupResultCard', () => {
  test('[CHKIN-RESULT-01] 확인 정보를 한 줄로 보이고 전화·생년월일은 없다', () => {
    renderCard({ status: '예약확정' })
    const card = screen.getByTestId('lookup-result')
    expect(within(card).getByText('오늘 10:30 · 내과 · 김의사')).toBeVisible()
    expect(card.textContent).not.toMatch(/010-|\d{4}-\d{2}-\d{2}/)
  })

  test('[CHKIN-RESULT-01] 예약확정이면 행동은 두 갈래 [진료 대기]·[도착]', () => {
    renderCard({ status: '예약확정' })
    const card = screen.getByTestId('lookup-result')
    expect(within(card).getByRole('button', { name: '진료 대기' })).toBeVisible()
    expect(within(card).getByRole('button', { name: '도착' })).toBeVisible()
    // 완료 전에는 [대기 목록에서 보기]를 그리지 않는다.
    expect(within(card).queryByRole('button', { name: '대기 목록에서 보기' })).toBeNull()
  })

  test('[CHKIN-RESULT-03] [도착]은 도착 갈래로, [진료 대기]는 진료대기 갈래로 부른다', async () => {
    const props = renderCard({ status: '예약확정' })
    await userEvent.click(screen.getByRole('button', { name: '도착' }))
    expect(props.onArrive).toHaveBeenCalledWith('도착')
    await userEvent.click(screen.getByRole('button', { name: '진료 대기' }))
    expect(props.onArrive).toHaveBeenCalledWith('진료대기')
  })

  test('[CHKIN-RESULT-03] 처리 실패면 카드를 지우지 않고 그 자리에 해결 문구와 [다시 확인]', () => {
    renderCard({ status: '예약확정' }, { actionError: '다른 직원이 먼저 처리했습니다.' })
    const card = screen.getByTestId('lookup-result')
    expect(within(card).getByText('다른 직원이 먼저 처리했습니다.')).toBeVisible()
    expect(within(card).getByRole('button', { name: '다시 확인' })).toBeVisible()
  })

  test('[CHKIN-RESULT-04] 이미 도착한 예약이면 [대기 목록에서 보기] 하나만', async () => {
    const props = renderCard({ status: '도착' })
    const card = screen.getByTestId('lookup-result')
    expect(within(card).getByText('도착')).toBeVisible()
    expect(within(card).queryByRole('button', { name: '도착' })).toBeNull()
    await userEvent.click(within(card).getByRole('button', { name: '대기 목록에서 보기' }))
    expect(props.onGoToQueue).toHaveBeenCalled()
  })
})
