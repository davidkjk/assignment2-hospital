import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { PickBar } from './PickBar'

// 동작 막대는 늘 [✉ 안내 보내기]·[⬇ 내려받기]·[취소]를 갖고, 고른 수를 센다. 상태 동작은 밖에서 넘겨받는다.
// 여러 명에 붙이면 안 되는 것(응급/재예약/되돌리기/번호 보기)은 애초에 막대에 없다(`PICK-ACT-01e·01f`).

function base(overrides = {}) {
  return {
    selectedCount: 2,
    visibleCount: 2,
    groupAction: null,
    onSend: vi.fn(),
    onDownload: vi.fn(),
    onCancel: vi.fn(),
    onSelectAllMatching: vi.fn(),
    onSelectVisibleOnly: vi.fn(),
    allMatching: false,
    ...overrides,
  }
}

test('[PICK-ACT-01][PICK-ACT-01b] 늘 있는 세 버튼과 선택 수', () => {
  render(<PickBar {...base()} />)
  expect(screen.getByText('2명 선택됨')).toBeVisible()
  expect(screen.getByRole('button', { name: '✉ 안내 보내기' })).toBeVisible()
  expect(screen.getByRole('button', { name: '⬇ 내려받기' })).toBeVisible()
  expect(screen.getByRole('button', { name: '취소' })).toBeVisible()
})

test('[PICK-ACT-01e][PICK-ACT-01f] 여러 명에 붙이면 안 되는 것들은 막대에 없다', () => {
  render(<PickBar {...base()} />)
  expect(screen.queryByRole('button', { name: /응급|재예약|되돌리기|번호 보기/ })).toBeNull()
})

test('[PICK-ACT-03] 0명이면 보내기·내려받기가 꺼지고 「보낼 사람을 고르세요」', () => {
  render(<PickBar {...base({ selectedCount: 0 })} />)
  expect(screen.getByText('보낼 사람을 고르세요')).toBeVisible()
  expect(screen.getByRole('button', { name: '✉ 안내 보내기' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '⬇ 내려받기' })).toBeDisabled()
})

test('[PICK-ACT-01c] 넘겨받은 상태 동작이 있으면 버튼으로 붙는다', async () => {
  const user = userEvent.setup()
  const onRun = vi.fn()
  render(<PickBar {...base({ groupAction: { kind: 'action', label: '진료 대기로', onRun } })} />)
  await user.click(screen.getByRole('button', { name: '진료 대기로' }))
  expect(onRun).toHaveBeenCalledTimes(1)
})

test('[PICK-MIX-03] 상태가 섞이면 왜 못 하는지 글자로 적는다', () => {
  render(<PickBar {...base({ groupAction: { kind: 'mixed', message: '상태가 섞여 있어 「도착 처리」는 할 수 없습니다' } })} />)
  expect(screen.getByText('상태가 섞여 있어 「도착 처리」는 할 수 없습니다')).toBeVisible()
})

test('[PICK-ALL-02] 검색 결과 전체는 따로 묻는다(보이는 수보다 전체가 클 때)', () => {
  render(<PickBar {...base({ selectedCount: 20, visibleCount: 20, matchTotal: 120 })} />)
  expect(screen.getByText(/이 검색 결과에는 120명이 있습니다/)).toBeVisible()
  expect(screen.getByRole('button', { name: '검색 결과 120명 전부 선택' })).toBeVisible()
})

test('[PICK-ALL-04] 전체를 켜면 경고 띠 + 「보이는 N명만 선택」이 같은 자리에', () => {
  render(<PickBar {...base({ selectedCount: 120, visibleCount: 20, matchTotal: 120, allMatching: true })} />)
  expect(screen.getByText('화면에 보이지 않는 100명이 포함됩니다')).toBeVisible()
  expect(screen.getByRole('button', { name: '보이는 20명만 선택' })).toBeVisible()
})
