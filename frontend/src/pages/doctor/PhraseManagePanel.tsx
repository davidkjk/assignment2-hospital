import { useState, type CSSProperties } from 'react'
import { BusyButton } from '../../components/BusyButton'
import type { Phrase } from './PhraseChips'

// [DOCTOR-PHRASE-04] 진료문구 관리 — 화면을 떠나지 않는 인라인 패널(PanelHost의 그릇 안). 의사 본인
//   소유 문구만 추가·수정·삭제(다른 의사 문구는 애초에 목록에 없다·RLS). 관리자 설정으로 보내지 않는다.
//   저장/삭제 실패는 초안을 지우지 않고 원래 행 가까이 알린다(PHRASE-05) — 여기선 서버 문장을 그대로 띄운다.

interface PhraseManagePanelProps {
  phrases: Phrase[]
  onCreate: (text: string) => Promise<void>
  onUpdate: (id: string, text: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function PhraseManagePanel({ phrases, onCreate, onUpdate, onDelete }: PhraseManagePanelProps) {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  async function guard(run: () => Promise<void>) {
    setError(null)
    try {
      await run()
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리하지 못했습니다.')
    }
  }

  return (
    <section aria-label="진료문구 관리" style={styles.wrap}>
      {error && <p role="alert" style={styles.error}>{error}</p>}

      <ul style={styles.list}>
        {phrases.map((p) => {
          const value = editing[p.id] ?? p.text
          const dirty = p.id in editing && editing[p.id].trim() !== p.text
          return (
            <li key={p.id} style={styles.row}>
              <textarea
                aria-label={`문구 편집 ${p.id}`}
                value={value}
                onChange={(e) => setEditing((m) => ({ ...m, [p.id]: e.target.value }))}
                rows={2}
                style={styles.textarea}
              />
              <div style={styles.rowActions}>
                <BusyButton
                  label="저장"
                  busyLabel="저장 중…"
                  disabled={!dirty}
                  onClick={() => guard(async () => {
                    await onUpdate(p.id, value.trim())
                    setEditing((m) => {
                      const next = { ...m }
                      delete next[p.id]
                      return next
                    })
                  })}
                />
                <button type="button" onClick={() => guard(() => onDelete(p.id))} style={styles.delete}>삭제</button>
              </div>
            </li>
          )
        })}
      </ul>

      <div style={styles.addBox}>
        <textarea
          aria-label="새 문구 내용"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="자주 쓰는 소견을 입력하세요"
          style={styles.textarea}
        />
        <BusyButton
          label="새 문구 추가"
          busyLabel="추가 중…"
          disabled={draft.trim().length === 0}
          onClick={() => guard(async () => {
            await onCreate(draft.trim())
            setDraft('')
          })}
        />
      </div>
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 12 },
  error: { margin: 0, color: 'var(--color-warn)', fontSize: 'var(--fs-sm)', fontWeight: 600 },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', flexDirection: 'column', gap: 6 },
  rowActions: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  textarea: {
    width: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 8,
    border: '1px solid var(--color-divider)', background: 'var(--color-surface)',
    color: 'var(--color-ink)', fontSize: 'var(--fs-base)', fontFamily: 'inherit', resize: 'vertical',
  },
  delete: {
    height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink-muted)', fontSize: 'var(--fs-base)', fontWeight: 600, cursor: 'pointer',
  },
  addBox: { display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--color-divider)', paddingTop: 12 },
}
