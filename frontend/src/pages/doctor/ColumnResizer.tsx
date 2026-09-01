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

/** 열 사이 경계 손잡이 — 포인터를 누른 지점 대비 이동량(delta)만 위로 넘긴다.
 *  ⭐ 평소엔 데모처럼 **얇은 1px 회색 단일선**으로 보인다(넉넉한 9px 잡이 영역 안에 선만 가운데). 6px 회색
 *  바를 통째로 칠하면 열의 오른쪽 경계선과 겹쳐 「회색 세로 두 줄」로 보였다(2026-09-01) — 그래서 잡이는
 *  투명하게 두고 가운데 선만 그린다. 가리키거나 끌 때만 딥틸로 굵어져 손잡이임을 알린다. */
export function ColumnResizer({ boundary, onDrag }: ColumnResizerProps) {
  const startX = useRef(0)
  const [dragging, setDragging] = useState(false)
  const [hover, setHover] = useState(false)

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

  const active = dragging || hover
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={boundary === 0 ? '대기·환자 맥락 경계' : '환자 맥락·기록 경계'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={styles.bar}
    >
      <div style={active ? { ...styles.line, ...styles.lineOn } : styles.line} />
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  // 잡이 영역은 넓게(9px)·투명하게 — 잡기 쉽되 그 자체가 회색으로 보이지 않는다.
  bar: {
    flex: '0 0 9px', width: 9, cursor: 'col-resize', background: 'transparent',
    display: 'flex', justifyContent: 'center', alignItems: 'stretch',
  },
  // 실제로 보이는 것은 가운데 1px 선뿐(데모의 열 구분선과 같은 두께).
  line: { width: 1, background: 'var(--color-divider)', transition: 'width 120ms, background 120ms' },
  lineOn: { width: 2, background: 'var(--color-primary)' },
}
