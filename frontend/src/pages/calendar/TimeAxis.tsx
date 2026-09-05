import { useEffect, useRef } from 'react'

// [CAL-TIME-01·08] 시간 눈금 — 글자는 30분마다, 15분마다 점선. ⛔ 최소 단위(5분)로 눈금을 깔지 않는다
//   (09~18시가 108줄이 된다). 촘촘히 보고 싶으면 확대한다(CAL-ZOOM-*).
// [CAL-ZOOM-01·02] 눈금 사이를 위아래로 끌어 1시간 높이를 바꾼다 — 창 크기 늘리듯. 커서로 잡을 곳을 표시한다.

function hhmm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export interface TimeAxisProps {
  startHour: number
  endHour: number
  hourHeight: number
  /** 끈 픽셀만큼 배율 변경을 알린다(부모의 useZoom.dragBy로 이어진다). */
  onDragBy: (deltaPx: number) => void
  /** 오늘·창 안이면 지금의 분 — gutter에 rose 시각 라벨을 그린다(CAL-PAST-05). 아니면 null. */
  nowMin?: number | null
}

export function TimeAxis({ startHour, endHour, hourHeight, onDragBy, nowMin = null }: TimeAxisProps) {
  const startMin = startHour * 60
  const endMin = endHour * 60
  const pxPerMinute = hourHeight / 60

  // 30분 눈금 글자.
  const labels: number[] = []
  for (let t = startMin; t <= endMin; t += 30) labels.push(t)
  // 15분 점선(글자 없음) — 30분 글자 자리는 제외한다.
  const dottedLines: number[] = []
  for (let t = startMin; t <= endMin; t += 15) if ((t - startMin) % 30 !== 0) dottedLines.push(t)

  // 드래그 — pointerdown에서 시작 y를 잡고 window에서 move/up을 듣는다.
  const dragging = useRef(false)
  const lastY = useRef(0)

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return
      onDragBy(e.clientY - lastY.current)
      lastY.current = e.clientY
    }
    function onUp() {
      dragging.current = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [onDragBy])

  return (
    <div
      className="cal-time-axis"
      data-testid="time-axis"
      style={{ cursor: 'ns-resize', height: `${(endMin - startMin) * pxPerMinute}px`, position: 'relative' }}
      onMouseDown={(e) => {
        dragging.current = true
        lastY.current = e.clientY
      }}
    >
      {labels.map((t) => (
        <div
          key={t}
          className="cal-axis-label"
          data-testid="axis-label"
          style={{ position: 'absolute', top: `${(t - startMin) * pxPerMinute}px` }}
        >
          {hhmm(t)}
        </div>
      ))}
      {dottedLines.map((t) => (
        <div
          key={t}
          className="cal-grid-line-15min"
          style={{ position: 'absolute', top: `${(t - startMin) * pxPerMinute}px` }}
        />
      ))}
      {nowMin != null && nowMin >= startMin && nowMin <= endMin && (
        <div
          className="cal-axis-now"
          data-testid="axis-now"
          style={{ top: `${(nowMin - startMin) * pxPerMinute}px` }}
        >
          {hhmm(nowMin)}
        </div>
      )}
    </div>
  )
}
