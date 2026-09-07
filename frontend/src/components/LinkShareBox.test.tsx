import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { LinkShareBox } from './LinkShareBox'

const LINK = 'https://staff.test/reset-password/new?token=abc'

test('[LINK-SHARE-01] 링크를 읽기전용 칸에 주어진 이름표로 노출하고 안내 문구를 보인다', () => {
  render(<LinkShareBox label="재초대 링크" link={LINK} guide="아래 링크를 복사해 전달하세요." />)
  const input = screen.getByLabelText('재초대 링크') as HTMLInputElement
  expect(input).toHaveValue(LINK)
  // 읽기전용 — 관리자가 값을 고칠 게 아니라 복사만 한다.
  expect(input).toHaveAttribute('readonly')
  expect(screen.getByText('아래 링크를 복사해 전달하세요.')).toBeVisible()
})

test('[LINK-SHARE-02] [링크 복사]를 누르면 클립보드에 링크를 넣고 복사됐다고 알린다', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  render(<LinkShareBox label="비밀번호 재설정 링크" link={LINK} guide="안내" />)

  fireEvent.click(screen.getByRole('button', { name: '링크 복사' }))

  expect(writeText).toHaveBeenCalledWith(LINK)
  expect(await screen.findByText('복사됐습니다')).toBeVisible()
})

test('[LINK-SHARE-02] 클립보드가 막힌 환경이어도 죽지 않는다 — 링크는 화면에 그대로 남는다', () => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) },
    configurable: true,
  })
  render(<LinkShareBox label="초대 링크" link={LINK} guide="안내" />)

  // 클릭이 예외를 던지지 않고(막다른 길 아님), 링크 칸은 그대로 선택·복사할 수 있게 남는다.
  fireEvent.click(screen.getByRole('button', { name: '링크 복사' }))
  expect(screen.getByLabelText('초대 링크')).toHaveValue(LINK)
  expect(screen.queryByText('복사됐습니다')).toBeNull()
})
