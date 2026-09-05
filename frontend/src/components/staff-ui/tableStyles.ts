import type { CSSProperties } from 'react'

/**
 * 직원 콘솔 공용 표 스타일.
 *
 * 표마다 헤더 선 두께(1px/2px)·헤더 띠 유무가 제각각이라(의사별 스케줄·병원 운영시간·자동 알림)
 * 나란히 놓으면 선이 다 달라 보이던 것을 하나로 맞춘다.
 *
 * 새 표는 헤더 `<th>`에 `tableHeadCell`을, 몸통 `<td>`에 `tableCell`을 펼쳐 쓰고
 * 정렬·nowrap 등 표별 속성만 덧붙인다. 값을 여기서만 바꾸면 모든 표가 함께 따라온다.
 */
export const tableHeadCell: CSSProperties = {
  padding: 'var(--sp-2)',
  fontSize: 'var(--fs-caption)',
  fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
  color: 'var(--color-ink-muted)',
  background: 'var(--color-bg)',
  borderBottom: '1px solid var(--color-divider)',
}

export const tableCell: CSSProperties = {
  padding: 'var(--sp-2)',
  borderBottom: '1px solid var(--color-divider)',
}
