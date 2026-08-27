import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { TimeAxis } from './TimeAxis'

test('[CAL-TIME-01] 눈금 글자는 30분마다다', () => {
  render(<TimeAxis startHour={9} endHour={12} hourHeight={120} onDragBy={() => {}} />)
  const labels = within(screen.getByTestId('time-axis'))
    .getAllByTestId('axis-label')
    .map((el) => el.textContent)
  expect(labels).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00'])
})

test('[CAL-TIME-08] 최소 단위(5분)로 촘촘한 격자를 깔지 않는다', () => {
  render(<TimeAxis startHour={9} endHour={18} hourHeight={120} onDragBy={() => {}} />)
  expect(document.querySelectorAll('.grid-line-5min')).toHaveLength(0)
})

test('[CAL-ZOOM-02] 잡을 곳을 표시한다 — 커서가 ns-resize다', () => {
  render(<TimeAxis startHour={9} endHour={12} hourHeight={120} onDragBy={() => {}} />)
  expect(screen.getByTestId('time-axis').style.cursor).toBe('ns-resize')
})

test('[CAL-ZOOM-01] 시간축을 위아래로 끌면 그 픽셀만큼 배율 변경을 알린다', () => {
  const onDragBy = vi.fn()
  render(<TimeAxis startHour={9} endHour={12} hourHeight={120} onDragBy={onDragBy} />)
  const axis = screen.getByTestId('time-axis')
  fireEvent.mouseDown(axis, { clientY: 100 })
  // document에 올린 이벤트는 window 리스너로 버블한다.
  fireEvent.mouseMove(document, { clientY: 130 })
  fireEvent.mouseUp(document, { clientY: 130 })
  expect(onDragBy).toHaveBeenCalledWith(30)
})

test('[CAL-TIME-02] 한 시간 높이가 커지면 눈금 사이 간격도 그만큼 벌어진다', () => {
  render(<TimeAxis startHour={9} endHour={10} hourHeight={200} onDragBy={() => {}} />)
  // 09:00 → 09:30 사이는 반 시간이라 hourHeight의 절반(100px)이다.
  const half = screen.getAllByTestId('axis-label')[1]
  expect(half.style.top).toBe('100px')
})
