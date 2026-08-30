import { useState, type CSSProperties } from 'react'

// [DOCTOR-PHRASE-01~05] 진료문구 칩(AD-064) — 전체 문구를 늘어놓지 않고 짧은 라벨 칩으로. 호버로 전체
//   미리보기. 커서가 있는 칸이 있을 때만 클릭이 삽입을 일으키고(없으면 잠금+이유), [관리]는 화면을
//   떠나지 않는 인라인 신호(onManage). 0건과 조회 실패를 다르게 그린다(0건엔 [다시 시도] 없음).

export interface Phrase {
  id: string
  text: string
}

/** 서버는 전체 문구(text)만 준다 — 첫 문장/줄을 짧은 라벨로 삼는다. */
export function phraseLabel(text: string): string {
  const head = text.split(/[.\n]/)[0].trim()
  return head.length > 16 ? `${head.slice(0, 16)}…` : head
}

interface PhraseChipsProps {
  phrases: Phrase[]
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  /** 지금 커서가 있는 작성 칸(없으면 삽입 잠금). */
  activeField: string | null
  onInsert: (text: string) => void
  onManage?: () => void
}

export function PhraseChips({ phrases, loading, error, onRetry, activeField, onInsert, onManage }: PhraseChipsProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const locked = activeField === null

  return (
    <section aria-label="진료문구" style={styles.wrap}>
      {error ? (
        <div style={styles.stateRow}>
          <span style={styles.stateText}>진료문구를 불러오지 못했습니다</span>
          <button type="button" onClick={onRetry} style={styles.retry}>다시 시도</button>
        </div>
      ) : loading ? (
        <div data-testid="skeleton" aria-hidden="true" style={styles.skeleton} />
      ) : phrases.length === 0 ? (
        <div style={styles.stateRow}>
          <span style={styles.stateText}>저장된 진료문구가 없습니다</span>
          <button type="button" onClick={onManage} style={styles.chip}>새 문구 추가</button>
        </div>
      ) : (
        <div style={styles.chips}>
          {locked && <span style={styles.lockNote}>문구를 넣을 칸을 먼저 선택하세요</span>}
          {phrases.map((p) => (
            <span key={p.id} style={styles.chipWrap} onMouseEnter={() => setHovered(p.id)} onMouseLeave={() => setHovered(null)}>
              <button
                type="button"
                disabled={locked}
                title={p.text}
                // 마우스로 눌러도 작성 칸의 커서/포커스를 뺏지 않는다 — 삽입 대상이 유지된다.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsert(p.text)}
                style={locked ? { ...styles.chip, ...styles.chipOff } : styles.chip}
              >
                {phraseLabel(p.text)}
              </button>
              {hovered === p.id && <span role="tooltip" style={styles.tooltip}>{p.text}</span>}
            </span>
          ))}
        </div>
      )}

      <div style={styles.manageRow}>
        <button type="button" onClick={onManage} style={styles.manageBtn}>관리</button>
      </div>
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 6 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chipWrap: { position: 'relative', display: 'inline-flex' },
  lockNote: { fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)', width: '100%' },
  chip: {
    height: 26, padding: '0 10px', borderRadius: 999, border: '1px solid var(--color-primary)',
    background: 'var(--color-primary-wash)', color: 'var(--color-primary)', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
  chipOff: { borderColor: 'var(--color-divider)', background: 'var(--color-bg)', color: 'var(--color-ink-muted)', cursor: 'not-allowed' },
  tooltip: {
    position: 'absolute', bottom: '100%', left: 0, zIndex: 20, marginBottom: 4, maxWidth: 280,
    padding: '6px 8px', borderRadius: 6, background: 'var(--color-ink)', color: '#fff', fontSize: 'var(--fs-caption)', lineHeight: 1.4,
  },
  stateRow: { display: 'flex', alignItems: 'center', gap: 8 },
  stateText: { fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  retry: {
    height: 26, padding: '0 10px', borderRadius: 6, border: '1px solid var(--color-primary)',
    background: 'var(--color-surface)', color: 'var(--color-primary)', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
  skeleton: { height: 26, borderRadius: 999, background: 'var(--color-bg)' },
  manageRow: { display: 'flex' },
  manageBtn: {
    height: 24, padding: '0 8px', borderRadius: 6, border: 'none', background: 'transparent',
    color: 'var(--color-ink-muted)', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
}
