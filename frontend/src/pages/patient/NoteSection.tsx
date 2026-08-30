import { useState, type CSSProperties } from 'react'
import { BusyButton } from '../../components/BusyButton'
import { EmptyState } from '../../components/EmptyState'
import { InlineError } from '../../components/InlineError'
import type { PatientNote } from '../../api/patients'
import type { SectionState } from './format'
import { mdHm } from './format'

// [PTDET-NOTE-01~05] 내부 메모 — 내용·작성 직원·시각을 최신순. 환자 공개 영역과 분리(staff-only, NOTE-01).
//   저장 중엔 라벨이 바뀌고 두 번 눌러도 한 번만 간다(NOTE-03·BTN-BUSY-01). 수정·삭제 버튼은
//   두지 않는다(NOTE-04 — 변경이력·삭제 복구 계약이 없다). 0건엔 [다시 시도]를 두지 않는다(NOTE-05).

interface NoteSectionProps {
  state: SectionState<PatientNote[]>
  /** 저장 창구 — 페이지가 POST 후 목록을 새로 읽는다. 성공/실패는 여기서 라벨·오류로 보인다. */
  onAdd: (content: string) => Promise<void>
}

export function NoteSection({ state, onAdd }: NoteSectionProps) {
  const [composing, setComposing] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const notes = state.data ?? []

  async function save() {
    if (!value.trim()) return
    setError(null)
    try {
      await onAdd(value.trim())
      setValue('')
      setComposing(false)
    } catch (e) {
      // 실패는 성공한 척하지 않고 버튼 곁에 붙박이로 보인다(ERR-POS-01).
      setError(e instanceof Error ? e.message : '메모를 저장하지 못했습니다.')
    }
  }

  return (
    <section aria-label="내부 메모" data-visibility="staff-only" style={styles.section}>
      <div style={styles.head}>
        <h2 style={styles.heading}>내부 메모</h2>
        {!composing && (
          <button type="button" onClick={() => setComposing(true)} style={styles.addBtn}>
            내부 메모 추가
          </button>
        )}
      </div>

      {composing && (
        <div style={styles.compose}>
          <textarea
            aria-label="내부 메모 내용"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={styles.textarea}
            rows={3}
          />
          {error && <InlineError message={error} />}
          <div style={styles.composeActions}>
            <button
              type="button"
              onClick={() => {
                setComposing(false)
                setValue('')
                setError(null)
              }}
              style={styles.cancel}
            >
              취소
            </button>
            <BusyButton label="저장" busyLabel="저장 중…" onClick={save} />
          </div>
        </div>
      )}

      {state.loading ? (
        <div data-testid="skeleton" aria-hidden="true" style={styles.skeleton} />
      ) : state.error ? (
        <EmptyState kind="error" onRetry={state.retry} />
      ) : notes.length === 0 && !composing ? (
        <p style={styles.empty}>아직 남겨진 내부 메모가 없습니다</p>
      ) : (
        <ul style={styles.list}>
          {notes.map((n) => (
            <li key={n.id} data-id={n.id} style={styles.row}>
              <p style={styles.content}>{n.content}</p>
              <p style={styles.byline}>
                <span>{n.staff_name}</span>
                <span style={styles.time}>{mdHm(n.created_at)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  section: {
    padding: 16, background: 'var(--color-surface)',
    border: '2px solid var(--color-divider)', borderRadius: 'var(--radius-card)',
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 },
  heading: { margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--color-ink)' },
  addBtn: {
    height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid var(--color-primary)',
    background: 'var(--color-surface)', color: 'var(--color-primary)', fontSize: 'var(--fs-sm)', fontWeight: 700, cursor: 'pointer',
  },
  compose: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 },
  textarea: {
    width: '100%', padding: 8, borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 'var(--fs-base)', resize: 'vertical',
  },
  composeActions: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  cancel: {
    height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink-muted)', fontSize: 'var(--fs-base)', fontWeight: 600, cursor: 'pointer',
  },
  skeleton: { height: 48, borderRadius: 6, background: 'var(--color-bg)' },
  empty: { margin: 0, fontSize: 'var(--fs-base)', color: 'var(--color-ink-muted)' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' },
  row: { padding: '8px 0', borderTop: '1px solid var(--color-divider)' },
  content: { margin: '0 0 2px', fontSize: 'var(--fs-base)', color: 'var(--color-ink)', overflowWrap: 'anywhere' },
  byline: { margin: 0, display: 'flex', gap: 8, fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  time: { fontVariantNumeric: 'tabular-nums' },
}
