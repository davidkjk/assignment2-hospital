import { useCallback, useRef, useState, type CSSProperties } from 'react'

// [DOCTOR-SHELL-04·05][AD-062] 3단 열 폭 조절 — 정해진 범위 안에서만 움직이고, 옆 열을 최소 폭 아래로
//   밀지 않는다. [기본값으로]는 230/300/540으로 즉시 복귀하되 ⛔ 서버에 저장하지 않고 다른 화면에
//   전파하지 않으며 새 설정 화면을 만들지 않는다(P-02). 이 상태는 화면 안에서만 산다.

export type ColKey = 'queue' | 'context' | 'record'
export type ColWidths = Record<ColKey, number>

export const COL_BOUNDS: Record<ColKey, [number, number]> = {
  queue: [200, 320],
  context: [280, 520],
  record: [440, 680],
}
export const DEFAULT_WIDTHS: ColWidths = { queue: 230, context: 300, record: 540 }

function clamp(w: number, [min, max]: [number, number]): number {
  return Math.max(min, Math.min(max, w))
}

/**
 * 경계 하나를 delta만큼 끌 때의 결과. boundary 0 = 대기|맥락, boundary 1 = 맥락|기록.
 * ⭐ 한 열을 clamp로 멈추면 그만큼만 옆 열에 넘겨, 옆 열도 자기 최소 아래로 안 내려간다.
 */
export function resize(widths: ColWidths, boundary: 0 | 1, delta: number): ColWidths {
  const [left, right]: [ColKey, ColKey] = boundary === 0 ? ['queue', 'context'] : ['context', 'record']
  const nl = clamp(widths[left] + delta, COL_BOUNDS[left])
  const applied = nl - widths[left]
  const nr = clamp(widths[right] - applied, COL_BOUNDS[right])
  const applied2 = widths[right] - nr // 옆 열이 clamp로 멈춘 실제 양
  const nl2 = clamp(widths[left] + applied2, COL_BOUNDS[left])
  return { ...widths, [left]: nl2, [right]: nr }
}

export function useColumnWidths() {
  const [widths, setWidths] = useState<ColWidths>(DEFAULT_WIDTHS)
  const drag = useCallback((boundary: 0 | 1, delta: number) => {
    setWidths((w) => resize(w, boundary, delta))
  }, [])
  const reset = useCallback(() => setWidths(DEFAULT_WIDTHS), [])
  return { widths, drag, reset }
}

interface ColumnResizerProps {
  boundary: 0 | 1
  onDrag: (boundary: 0 | 1, delta: number) => void
}

/** 열 사이 경계 손잡이 — 포인터를 누른 지점 대비 이동량(delta)만 위로 넘긴다. */
export function ColumnResizer({ boundary, onDrag }: ColumnResizerProps) {
  const startX = useRef(0)
  const [dragging, setDragging] = useState(false)

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    startX.current = e.clientX
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return
    const delta = e.clientX - startX.current
    startX.current = e.clientX
    onDrag(boundary, delta)
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    setDragging(false)
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={boundary === 0 ? '대기·환자 맥락 경계' : '환자 맥락·기록 경계'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={dragging ? { ...styles.bar, ...styles.barOn } : styles.bar}
    />
  )
}

const styles: Record<string, CSSProperties> = {
  bar: { width: 6, flex: '0 0 6px', cursor: 'col-resize', background: 'var(--color-divider)' },
  barOn: { background: 'var(--color-primary)' },
}
