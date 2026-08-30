import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { dialogStyles } from '../../../components/ConfirmDialog'
import { InlineError } from '../../../components/InlineError'
import { ApiError, isSessionExpiry, rememberReturn } from '../../../api/httpClient'
import { useAuth } from '../../../auth/useAuth'
import { useConnectivity } from '../../../lib/connectivity'
import { formatHospitalDateTime } from '../../../lib/clock'
import { Checkbox } from '@/components/staff-ui'
import { undoMerge, type MergeEventData, type UndoResult } from '../../../api/mergeHistory'

// [MHIST-CONFIRM-01·02·03 · NAV-04·05·06 · EXC-03·05 · MERGE-RACE-01] 되돌림 확인창.
// ⭐ 가운데서 막아서고 뒤 배경은 읽기 전용이다(바깥을 눌러도 안 닫힌다). 되돌릴 수 없는 「빨간 버튼」은
//    오직 이 확인창 안에서, 읽음 체크 뒤에만 열린다. 읽음 체크는 이해 확인일 뿐 서버로 보내지 않는다.
// ⭐ 확정은 expected_status를 실어 서버 동시성 재검사에 맡긴다 — 처리 중 중복 클릭은 ref로 막는다.

interface UndoConfirmDialogProps {
  event: MergeEventData
  reason: string
  onConfirmed: (result: UndoResult) => void
  onCancel: () => void
}

export function UndoConfirmDialog({ event, reason, onConfirmed, onCancel }: UndoConfirmDialogProps) {
  const [acked, setAcked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [raced, setRaced] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const busyRef = useRef(false)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const navigate = useNavigate()
  const loc = useLocation()
  const { online } = useConnectivity()
  const { staff } = useAuth()

  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  async function confirm() {
    if (busyRef.current || !acked) return   // MHIST-CONFIRM-03 — 처리 중 두 번째 클릭 무시
    busyRef.current = true
    setBusy(true)
    setErrorMsg(null)
    try {
      const result = await undoMerge(event.merge_event_id, {
        reason,
        expected_status: event.undo_status,
      })
      onConfirmed(result)
    } catch (e) {
      busyRef.current = false
      setBusy(false)
      if (e instanceof ApiError && e.status === 409) {
        // MHIST-EXC-05 — 이미 되돌림 처리됨. 확정 버튼을 없애고 이력으로 돌아갈 길만 남긴다.
        setRaced(true)
        return
      }
      if (e instanceof ApiError && isSessionExpiry(e.status, online)) {
        // MHIST-EXC-03 — 온라인 401만 세션 만료. 돌아올 곳(주소만)을 남기고 로그인으로.
        rememberReturn(loc.pathname, staff?.staffId ?? '')
        navigate('/login')
        return
      }
      setErrorMsg(e instanceof ApiError ? e.message : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.')
    }
  }

  return (
    <div style={dialogStyles.scrim} data-testid="dialog-scrim">
      <div role="dialog" aria-modal="true" aria-label="병합 되돌림 확정" style={styles.dialog}>
        {raced ? (
          <>
            <h2 style={styles.title}>이미 되돌림 처리됨</h2>
            <p style={styles.message}>이 병합은 이미 되돌림 처리되었습니다. 최신 이력에서 상태를 확인해 주세요.</p>
            <div style={styles.actions}>
              <button type="button" style={styles.backBtn} onClick={() => navigate('/admin/merge-history')}>
                이력으로 돌아가기
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 style={styles.title}>병합을 되돌리기 전에 확인하세요</h2>
            <dl style={styles.items}>
              <Item label="대표 → 대상" value={`${event.primary.name} → ${event.merged.name}`} />
              <Item label="병합 시각" value={formatHospitalDateTime(event.merged_at)} />
              <Item label="사유" value={reason} />
            </dl>
            {/* MHIST-CONFIRM-01 — 무엇이 남고 무엇이 안 되는지 정확히. */}
            <p style={styles.keep}>원본 예약·문진·의료기록·감사기록은 지워지지 않습니다.</p>
            <p style={styles.warn}>이미 열람된 기록은 되돌릴 수 없습니다.</p>
            <p style={styles.audit}>이 되돌림은 별도 감사 이벤트로 남습니다.</p>

            {errorMsg && <InlineError message={errorMsg} />}

            {/* MHIST-CONFIRM-02 — 읽음 체크 필수. 서버 권한·최신 상태·동시성 검사를 대체하지 않는다. */}
            <div style={{ marginTop: 'var(--sp-4)' }}>
              <Checkbox
                checked={acked}
                onChange={setAcked}
                ariaLabel="위 보존·열람 제한·감사 잔존 안내를 읽었습니다"
                label="위 보존·열람 제한·감사 잔존 안내를 읽었습니다"
              />
            </div>

            <div style={styles.actions}>
              {/* MHIST-NAV-05 — [취소]는 상세로 돌아가고 아무것도 바꾸지 않는다. */}
              <button type="button" onClick={onCancel} style={styles.cancel}>취소</button>
              <button
                ref={confirmRef}
                type="button"
                className="danger"
                data-testid="danger"
                onClick={confirm}
                disabled={!acked || busy}
                aria-busy={busy}
                style={acked && !busy ? { ...styles.confirm, ...styles.danger } : { ...styles.confirm, ...styles.confirmOff }}
              >
                {busy ? '◌ 되돌리는 중…' : '되돌림 확정'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.item}>
      <dt style={styles.itemLabel}>{label}</dt>
      <dd style={styles.itemValue}>{value}</dd>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  dialog: {
    width: 'min(460px, calc(100vw - 32px))',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)',
    borderRadius: 'var(--radius-card)',
    boxShadow: '0 8px 32px rgba(16,36,58,.20)',
    padding: 'var(--sp-5)',
  },
  title: { margin: 0, fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  message: { margin: 'var(--sp-3) 0 0', fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)', lineHeight: 1.5 },
  items: { margin: 'var(--sp-4) 0 0', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' },
  item: { display: 'grid', gridTemplateColumns: '96px 1fr', gap: 'var(--sp-3)', fontSize: 'var(--fs-body)' },
  itemLabel: { margin: 0, color: 'var(--color-ink-muted)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'] },
  itemValue: { margin: 0, color: 'var(--color-ink)', lineHeight: 1.5 },
  keep: { margin: 'var(--sp-4) 0 0', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  warn: { margin: 'var(--sp-1) 0 0', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-danger)' },
  audit: { margin: 'var(--sp-1) 0 0', fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', marginTop: 'var(--sp-5)' },
  cancel: {
    height: 34, padding: '0 var(--sp-4)', borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
  confirm: {
    height: 34, padding: '0 var(--sp-4)', borderRadius: 8, border: 'none',
    color: '#fff', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
  danger: { background: 'var(--color-danger)' },
  confirmOff: { background: 'var(--color-sidebar-ink)', opacity: 0.5, cursor: 'not-allowed' },
  backBtn: {
    height: 34, padding: '0 var(--sp-4)', borderRadius: 8, border: '1px solid var(--color-primary)',
    background: 'var(--color-surface)', color: 'var(--color-primary)', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
}
