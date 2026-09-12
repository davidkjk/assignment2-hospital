import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { SlotBlock } from './SlotBlock'

test('[CAL-SLOT-04] 모양은 셋뿐이다 — 점선(빈)·색블록(예약)·빗금(못잡음)', () => {
  const { rerender } = render(<SlotBlock block={{ kind: 'empty', label: '빈 시간 09:45–10:30' }} />)
  expect(screen.getByTestId('slot').className).toContain('is-dotted')
  rerender(<SlotBlock block={{ kind: 'hatched', label: '휴진 09:00–10:00' }} />)
  expect(screen.getByTestId('slot').className).toContain('is-hatched')
  rerender(
    <SlotBlock block={{ kind: 'booked', patientLabel: '김민지', statusLabel: '확정', paletteIndex: 3 }} />,
  )
  expect(screen.getByTestId('slot').className).toContain('is-filled')
})

test('[CAL-SLOT-01][CAL-GAP-01] 빈 시간은 시각 범위를(짧으면 길이를) 글자로 적는다', () => {
  render(<SlotBlock block={{ kind: 'empty', label: '빈 시간 5분' }} />)
  expect(screen.getByText('빈 시간 5분')).toBeVisible()
})

test('[CAL-SLOT-03][CAL-SLOT-08] 휴진·점심은 같은 빗금이고 글자만 다르다', () => {
  const { rerender } = render(<SlotBlock block={{ kind: 'hatched', label: '휴진 09:00–10:00' }} />)
  expect(screen.getByText('휴진 09:00–10:00')).toHaveClass('is-hatched')
  rerender(<SlotBlock block={{ kind: 'hatched', label: '점심시간 12:30–13:30' }} />)
  expect(screen.getByText('점심시간 12:30–13:30')).toHaveClass('is-hatched')
})

test('[CAL-SLOT-02] 예약 블록은 환자 이름과 상태 글자를 담는다', () => {
  render(
    <SlotBlock
      block={{ kind: 'booked', patientLabel: '김민지', statusLabel: '신청 · 미확정', paletteIndex: 3 }}
    />,
  )
  expect(screen.getByTestId('slot')).toHaveTextContent('김민지')
  expect(screen.getByTestId('slot')).toHaveTextContent('신청 · 미확정')
})

test('[CAL-COLOR-14] 예약 블록은 면+진한 글자이고 색 테두리를 두르지 않는다', () => {
  render(<SlotBlock block={{ kind: 'booked', patientLabel: '김민지', statusLabel: '확정', paletteIndex: 3 }} />)
  const slot = screen.getByTestId('slot')
  expect(slot.style.background).toBe('var(--doctor-palette-3-fill)')
  expect(slot.style.color).toBe('var(--doctor-palette-3)')
  // 색 테두리를 두르지 않는다 — 어떤 border 색도 인라인으로 얹지 않는다.
  expect(slot.style.borderColor).toBe('')
})

test('[CAL-COLOR-14] 연속 예약은 흰 실선 1px로 갈린다', () => {
  render(
    <SlotBlock
      block={{ kind: 'booked', patientLabel: '최유나', statusLabel: '확정', paletteIndex: 1, backToBack: true }}
    />,
  )
  expect(screen.getByTestId('slot').style.boxShadow).toBe('0 1px 0 #fff')
})

test('[CAL-SLOT-05] 일정 변경 영향 예약은 「확인 필요」 배지를 단다', () => {
  render(
    <SlotBlock
      block={{ kind: 'booked', patientLabel: '정우성', statusLabel: '확정', paletteIndex: 2, warnings: ['affected'] }}
    />,
  )
  expect(screen.getByText('확인 필요')).toBeVisible()
})

test('[CAL-GAP-07] 겹쳐 저장된 블록은 「겹침」 배지를 단다', () => {
  render(
    <SlotBlock
      block={{ kind: 'booked', patientLabel: '정우성', statusLabel: '확정', paletteIndex: 2, warnings: ['overlap'] }}
    />,
  )
  expect(screen.getByText('겹침')).toBeVisible()
})

test('[CAL-COLOR-15] 경고 배지는 흰 바탕 pill이라 어느 의사 면 위에서도 뜬다', () => {
  render(
    <SlotBlock
      block={{ kind: 'booked', patientLabel: '정우성', statusLabel: '확정', paletteIndex: 4, warnings: ['affected'] }}
    />,
  )
  expect(screen.getByTestId('slot-badge').style.background).toBe('var(--color-surface)')
})

test('[CAL-PAST-01] 지난 시각의 빈 곳은 흐리게 「지난 시간」이다', () => {
  render(<SlotBlock block={{ kind: 'past-empty', label: '지난 시간' }} />)
  const slot = screen.getByTestId('slot')
  expect(slot.className).toContain('is-past')
  expect(slot).toHaveTextContent('지난 시간')
})
