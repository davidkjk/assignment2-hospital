import { useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { InlineError } from '../../../components/InlineError'
import { ApiError } from '../../../api/httpClient'
import { useConnectivity } from '../../../lib/connectivity'
import { saveMergeAuditNote, type MergeEventData } from '../../../api/mergeHistory'
import { TextArea } from '@/components/staff-ui'

// [MHIST-LOCK-01·02·03 · NAV-08 · EXC-05] 되돌림불가 잠김.
// ⛔ 되돌림 성공으로 표현하지 않는다. 막다른 길을 만들지 않고 대상 환자·감사메모 경로를 준다.
// 감사메모는 병합 이벤트·잠김 사유·검토 메모를 대상 환자 내부 메모로 남긴다(운영 참고).

interface LockedEventPanelProps {
  event: MergeEventData
}

export function LockedEventPanel({ event }: LockedEventPanelProps) {
  const navigate = useNavigate()
  const { online } = useConnectivity()
  const mergedId = event.merged.patient_id ?? ''
  const [memoOpen, setMemoOpen] = useState(false)
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const busyRef = useRef(false)

  if (event.undo_status === 'undone') {
    // 이미 되돌림 처리된 이벤트를 다시 연 경우 — 되돌림 버튼 없이 이력으로만 돌려보낸다.
    return (
      <section aria-label="되돌림 완료 상태" style={styles.panel}>
        <h2 style={styles.title}>이미 되돌림 처리된 병합입니다</h2>
        <p style={styles.reason}>이 병합은 되돌림이 완료되었습니다. 최신 이력에서 상태를 확인할 수 있습니다.</p>
        <div style={styles.actions}>
          <button type="button" style={styles.exitBtn} onClick={() => navigate('/admin/merge-history')}>이력으로 돌아가기</button>
        </div>
      </section>
    )
  }

  async function saveMemo() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setErrorMsg(null)
    const body = `병합 이벤트 ${event.merge_event_id} · 잠김 사유: ${event.lock_reason ?? '기록 없음'} · 검토 메모: ${memo}`
    try {
      await saveMergeAuditNote(mergedId, body)
      setSaved(true)
      setMemoOpen(false)
    } catch (e) {
      setErrorMsg(e instanceof ApiError ? e.message : '메모를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <section aria-label="되돌림불가" style={styles.panel}>
      <h2 style={styles.title}>이 병합은 되돌릴 수 없습니다</h2>
      {/* MHIST-LOCK-01 — 서버가 정한 비가역 사유를 읽기 전용으로. 강제 우회·삭제 없음. */}
      <p style={styles.reason}>{event.lock_reason ?? '서버가 되돌림 불가로 판정했습니다.'}</p>

      <div style={styles.actions}>
        {/* MHIST-LOCK-02 · NAV-08 — 대상 환자 상세로 이어 준다(막다른 길 방지). 권한·마스킹은 기존 규칙. */}
        <button type="button" style={styles.exitBtn} onClick={() => navigate(`/patients/${mergedId}`)}>대상 환자 열기</button>
        <button type="button" style={styles.memoBtn} onClick={() => setMemoOpen((v) => !v)}>감사메모 저장</button>
      </div>

      {memoOpen && (
        <div style={styles.memoWrap}>
          <label htmlFor="mhist-audit-memo" style={styles.memoLabel}>검토 메모</label>
          <TextArea id="mhist-audit-memo" ariaLabel="감사메모" value={memo} onChange={setMemo} rows={3} />
          {errorMsg && <InlineError message={errorMsg} />}
          <div style={styles.memoActions}>
            <button
              type="button"
              onClick={saveMemo}
              disabled={busy || !online}
              aria-busy={busy}
              style={busy || !online ? { ...styles.saveBtn, ...styles.saveOff } : styles.saveBtn}
            >
              {busy ? '◌ 저장 중…' : '메모 저장'}
            </button>
            {!online && <span style={styles.memoHint}>연결되면 감사메모를 저장할 수 있습니다</span>}
          </div>
        </div>
      )}

      {saved && (
        // ⛔ 되돌림 성공이 아니라 운영 참고 저장이다.
        <p role="status" style={styles.savedNote}>감사메모를 대상 환자 기록에 남겼습니다</p>
      )}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  panel: { padding: 'var(--sp-4)', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-card)', background: 'var(--color-surface)', borderLeft: '4px solid var(--color-danger)' },
  title: { margin: 0, fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  reason: { margin: 'var(--sp-2) 0 0', fontSize: 'var(--fs-body)', color: 'var(--color-ink)', lineHeight: 1.5 },
  actions: { display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-4)' },
  exitBtn: { height: 34, padding: '0 var(--sp-4)', borderRadius: 8, border: '1px solid var(--color-primary)', background: 'var(--color-surface)', color: 'var(--color-primary)', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], cursor: 'pointer' },
  memoBtn: { height: 34, padding: '0 var(--sp-4)', borderRadius: 8, border: '1px solid var(--color-divider)', background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], cursor: 'pointer' },
  memoWrap: { marginTop: 'var(--sp-4)', padding: 'var(--sp-3)', borderRadius: 10, background: 'var(--color-bg)', border: '1px solid var(--color-divider)' },
  memoLabel: { display: 'block', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink-muted)', marginBottom: 'var(--sp-2)' },
  memoActions: { display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginTop: 'var(--sp-3)' },
  saveBtn: { height: 34, padding: '0 var(--sp-4)', borderRadius: 8, border: 'none', background: 'var(--color-primary)', color: '#fff', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], cursor: 'pointer' },
  saveOff: { background: 'var(--color-sidebar-ink)', opacity: 0.5, cursor: 'not-allowed' },
  memoHint: { fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  savedNote: { margin: 'var(--sp-3) 0 0', fontSize: 'var(--fs-body)', color: 'var(--color-done)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'] },
}
