import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { PanelHost, PanelProvider, usePanel } from './PanelHost'

// 패널은 자리가 아니라 상태다 — 앱 전체에 하나. 내용/왼쪽 화면은 소비 화면(Task 9·14·24)이 채운다.
// 여기서는 PanelHost가 소유하는 계약만 본다: 하나뿐 · 접기/닫기 구분 · 접어도 채운 것이 산다 · 출발지 기억.

function Rig() {
  const { openPanel } = usePanel()
  return (
    <div>
      <button onClick={() => openPanel({ title: '김민정 님 예약', origin: '/patients?q=김', content: <input aria-label="이름" defaultValue="" /> })}>
        열기A
      </button>
      <button onClick={() => openPanel({ title: '이철수 님 예약', origin: '/calendar', content: <input aria-label="이름" defaultValue="이철수" /> })}>
        열기B
      </button>
    </div>
  )
}

function renderHost() {
  return render(
    <PanelProvider>
      <Rig />
      <PanelHost />
    </PanelProvider>,
  )
}

test('[PANEL-ONE-01] 패널은 언제나 하나이고, 바꿀 때 묻지 않는다', async () => {
  const user = userEvent.setup()
  renderHost()
  await user.click(screen.getByRole('button', { name: '열기A' }))
  await user.click(screen.getByRole('button', { name: '열기B' }))
  expect(screen.getAllByRole('complementary')).toHaveLength(1)
  expect(screen.queryByRole('dialog')).toBeNull() // 저장 안 한 것이 날아가도 확인창을 두지 않는다
})

test('[PANEL-LIVE-05][PANEL-LIVE-06] 접기와 닫기를 글자로 구분하고, 닫기는 묻지 않는다', async () => {
  const user = userEvent.setup()
  renderHost()
  await user.click(screen.getByRole('button', { name: '열기A' }))
  expect(screen.getByRole('button', { name: '«접기' })).toBeVisible()
  expect(screen.getByRole('button', { name: '✕ 닫기' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: '✕ 닫기' }))
  expect(screen.queryByRole('complementary')).toBeNull()
  expect(screen.queryByRole('dialog')).toBeNull() // 확인창 없음
})

test('[PANEL-LIVE-03][PANEL-LIVE-04] 접으면 얇은 띠로 줄고, 펼치면 채운 것이 그대로 있다', async () => {
  const user = userEvent.setup()
  renderHost()
  await user.click(screen.getByRole('button', { name: '열기A' }))
  await user.type(screen.getByLabelText('이름'), '김민정')
  await user.click(screen.getByRole('button', { name: '«접기' }))

  const strip = screen.getByRole('complementary', { name: '작성 중인 패널' })
  expect(strip).toHaveTextContent('김민정 님 예약 작성 중')
  await user.click(within(strip).getByRole('button'))
  expect(screen.getByLabelText('이름')).toHaveValue('김민정') // 채운 것이 살아 있다
})

test('[PANEL-LIVE-07][PANEL-LIVE-08][PANEL-ONE-01] 접힌 채로 다른 패널을 열면 띠가 새 내용으로 바뀐다', async () => {
  const user = userEvent.setup()
  renderHost()
  await user.click(screen.getByRole('button', { name: '열기A' }))
  await user.click(screen.getByRole('button', { name: '«접기' }))
  await user.click(screen.getByRole('button', { name: '열기B' })) // 접힌 채로 다른 것을 열었다
  expect(screen.getAllByRole('complementary')).toHaveLength(1) // 여전히 하나
  expect(screen.getByRole('complementary')).toHaveTextContent('이철수 님 예약 작성 중')
})

test('[PANEL-HOME-01] 출발한 화면을 기억해 둔다', async () => {
  const user = userEvent.setup()
  let seen: string | undefined
  function Reader() {
    seen = usePanel().panel?.origin
    return null
  }
  render(
    <PanelProvider>
      <Rig />
      <Reader />
    </PanelProvider>,
  )
  await user.click(screen.getByRole('button', { name: '열기A' }))
  expect(seen).toBe('/patients?q=김')
})
