import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { PhraseChips, phraseLabel } from './PhraseChips'

// [DOCTOR-PHRASE-01~05] 진료문구 칩 — 전체 문구를 늘어놓지 않고 짧은 라벨 칩. 호버로 전체 미리보기.
//   커서가 있는 칸에만 삽입(없으면 잠금+이유). [관리]는 화면을 떠나지 않는 인라인. 0건·실패를 구분.

const PHRASE = { id: 'ph1', text: '상기도 감염 소견. 3일간 경과 관찰 후 재방문 권고.' }

function renderChips(over: Partial<Parameters<typeof PhraseChips>[0]> = {}) {
  const onInsert = vi.fn()
  const onManage = vi.fn()
  render(
    <PhraseChips phrases={[PHRASE]} activeField="diagnosis" onInsert={onInsert} onManage={onManage} {...over} />,
  )
  return { onInsert, onManage }
}

describe('PhraseChips', () => {
  test('[DOCTOR-PHRASE-01] 칩은 짧은 라벨만, 전체 문구는 안 늘어놓는다', () => {
    renderChips()
    const chip = screen.getByRole('button', { name: phraseLabel(PHRASE.text) })
    expect(chip).toHaveTextContent('상기도 감염 소견')
    expect(chip).not.toHaveTextContent('3일간 경과 관찰')
  })

  test('[DOCTOR-PHRASE-01] 호버하면 전체 문구를 미리 보여준다', async () => {
    const user = userEvent.setup()
    renderChips()
    await user.hover(screen.getByRole('button', { name: phraseLabel(PHRASE.text) }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      '상기도 감염 소견. 3일간 경과 관찰 후 재방문 권고.',
    )
  })

  test('[DOCTOR-PHRASE-02] 커서가 있는 칸이 있으면 클릭 시 전체 문구를 그 칸으로 보낸다', async () => {
    const user = userEvent.setup()
    const { onInsert } = renderChips({ activeField: 'diagnosis' })
    await user.click(screen.getByRole('button', { name: phraseLabel(PHRASE.text) }))
    expect(onInsert).toHaveBeenCalledWith(PHRASE.text)
  })

  test('[DOCTOR-PHRASE-02] 커서 둘 곳이 없으면 칩을 잠그고 이유를 말한다', () => {
    const { onInsert } = renderChips({ activeField: null })
    expect(screen.getByRole('button', { name: phraseLabel(PHRASE.text) })).toBeDisabled()
    expect(screen.getByText('문구를 넣을 칸을 먼저 선택하세요')).toBeVisible()
    expect(onInsert).not.toHaveBeenCalled()
  })

  test('[DOCTOR-PHRASE-03] [관리]는 인라인으로 열도록 알린다(화면을 떠나지 않는다)', async () => {
    const user = userEvent.setup()
    const { onManage } = renderChips()
    await user.click(screen.getByRole('button', { name: '관리' }))
    expect(onManage).toHaveBeenCalledTimes(1)
  })

  test('[DOCTOR-PHRASE-05] 0건엔 [관리]·[새 문구 추가]만, [다시 시도]는 없다', () => {
    renderChips({ phrases: [] })
    expect(screen.getByRole('button', { name: '관리' })).toBeVisible()
    expect(screen.getByRole('button', { name: '새 문구 추가' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
  })

  test('[DOCTOR-PHRASE-05] 조회 실패엔 [다시 시도]를 준다', () => {
    const onRetry = vi.fn()
    renderChips({ phrases: [], error: true, onRetry })
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeVisible()
  })
})
