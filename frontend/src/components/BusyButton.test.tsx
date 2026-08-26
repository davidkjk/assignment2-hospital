import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { BusyButton, needsBusyState } from './BusyButton'

test('[BTN-BUSY-01][BTN-BUSY-02] 글자를 지우지 않고 「◌ …중」으로 바꾸며 다시 눌러도 한 번만 간다', async () => {
  const user = userEvent.setup()
  // 처리를 붙잡아 두는 약속 — 그 사이에 다시 눌러도 무시되는지 본다.
  let resolve!: () => void
  const send = vi.fn(() => new Promise<void>((r) => { resolve = r }))
  render(<BusyButton label="예약 신청하기" busyLabel="예약 신청 중…" onClick={send} />)

  await user.click(screen.getByRole('button'))
  expect(screen.getByRole('button')).toHaveTextContent('◌ 예약 신청 중…')
  await user.click(screen.getByRole('button')) // 처리 중 또 눌렀다
  expect(send).toHaveBeenCalledTimes(1) // 무시한다
  resolve()
  // 처리가 끝나면 원래 글자로 돌아온다(상태 갱신을 act 안에서 마무리).
  await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('예약 신청하기'))
})

test('[BTN-STATE-02] 처리 중에는 회색으로 칠하지 않는다 — 흐린 딥틸이다', () => {
  render(<BusyButton label="저장" busy />)
  const btn = screen.getByRole('button')
  expect(btn).toHaveStyle({ background: 'var(--color-sidebar-ink)', color: '#fff' })
  expect(btn).not.toHaveStyle({ background: 'var(--color-gray-past)' })
})

test('[BTN-STATE-03] 처리 중에도 글자가 살아 있어 방금 누른 것이 무엇인지 남는다', () => {
  render(<BusyButton label="저장" busyLabel="저장 중…" busy />)
  expect(screen.getByRole('button')).toHaveTextContent('◌ 저장 중…')
})

test('[BTN-SCOPE-01][BTN-SCOPE-02] 서버에 무언가를 남기는 버튼에만 적용한다', () => {
  expect(needsBusyState({ method: 'POST' })).toBe(true)
  expect(needsBusyState({ method: 'PATCH' })).toBe(true)
  expect(needsBusyState({ method: 'GET' })).toBe(false) // 조회
  expect(needsBusyState({ kind: 'navigate' })).toBe(false) // 화면 이동
  expect(needsBusyState({ kind: 'expand' })).toBe(false) // 펼치기
})
