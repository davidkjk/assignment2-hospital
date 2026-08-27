import type { CSSProperties } from 'react'

// 검색 화면의 빈 상태 둘(SEARCH-RESULT-10 · SB-17). 오류·오프라인은 이어받기 줄(RESULT-06)이 따로 맡는다.
//   ① 검색 전 — 사용법 3줄만. ⛔ 「최근 본 환자」를 두지 않는다(어깨너머 노출 방지, SB-17).
//   ② 0건 — 「없습니다」 + 다음에 할 일. ⛔ [다시 시도]를 두지 않는다(0건은 오류가 아니다).

// SB-17 — 검색 전 사용법만. 이름 조각·형태 그대로·이어 치기, 셋을 짧게 알린다.
export function UsageHints() {
  return (
    <ul style={styles.hints} aria-label="검색 사용법">
      <li>이름 일부만 넣어도 찾을 수 있어요</li>
      <li>전화·생일은 형태 그대로 붙여넣어도 돼요</li>
      <li>뒤에 이어 치면 결과가 좁혀져요</li>
    </ul>
  )
}

// RESULT-10 + SB-20 — 0건이면 손을 칸으로 옮기지 않게 두 버튼을 그 자리에 둔다.
export function ZeroResult({
  onDropLast,
  onClear,
}: {
  onDropLast: () => void
  onClear: () => void
}) {
  return (
    <div style={styles.zero} role="status">
      <p style={styles.zeroTitle}>조회된 환자가 없습니다</p>
      <p style={styles.zeroHint}>조각을 줄이면 더 넓게 찾습니다.</p>
      <div style={styles.zeroActions}>
        <button type="button" style={styles.zeroBtn} onClick={onDropLast}>
          마지막 조각 지우기
        </button>
        <button type="button" style={styles.zeroBtn} onClick={onClear}>
          검색어 모두 지우기
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  hints: {
    listStyle: 'none',
    margin: '10px 0 0',
    padding: '10px 12px',
    display: 'grid',
    gap: 4,
    background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)',
    borderRadius: 'var(--radius-card)',
    color: 'var(--color-ink-muted)',
    fontSize: 'var(--fs-base)',
  },
  zero: {
    margin: '10px 0 0',
    padding: 16,
    background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)',
    borderRadius: 'var(--radius-card)',
    textAlign: 'center',
  },
  zeroTitle: { margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--color-ink)' },
  zeroHint: { margin: '4px 0 12px', fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  zeroActions: { display: 'flex', gap: 8, justifyContent: 'center' },
  zeroBtn: {
    height: 30,
    padding: '0 14px',
    borderRadius: 6,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-base)',
    fontWeight: 600,
    cursor: 'pointer',
  },
}
