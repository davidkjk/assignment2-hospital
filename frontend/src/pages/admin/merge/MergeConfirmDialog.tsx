import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { dialogStyles } from '../../../components/ConfirmDialog'
import { ApiError } from '../../../api/httpClient'
import { patientMergeApi, type CandidateRow, type MergeResult } from '../../../api/patientMerge'
import { Checkbox } from '@/components/staff-ui'

// [MERGE-CONFIRM-01~05 · MERGE-UNDO-02 · MERGE-DATA-04 · MERGE-AUDIT-01 · MERGE-RACE-01]
// 3단계의 마지막. ⭐ 가운데서 막아서고 뒤 배경은 읽기 전용이다(BLOCK-CONF-01) — 바깥을 눌러도 안 닫힌다.
// ⭐ 되돌릴 수 없는 병합의 「빨간 버튼」은 오직 이 확인창 안에서만, 그것도 읽음 체크 뒤에만 열린다(결정 #18).
// ⭐ 읽음 체크는 이해 확인일 뿐 서버로 보내지 않는다(CONFIRM-04) — 서버의 동시성 재검사를 대신하지 않는다.

interface MergeConfirmDialogProps {
  primary: CandidateRow
  duplicate: CandidateRow
  onCancel: () => void
  onConfirmed: (result: MergeResult) => void
  /** 409(후보 상태 변화·이중 계정)일 때 [다시 확인] — 최신 후보를 다시 읽고 목록으로 돌아간다. */
  onRecheck: () => void
}

export function MergeConfirmDialog({ primary, duplicate, onCancel, onConfirmed, onRecheck }: MergeConfirmDialogProps) {
  const [acked, setAcked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  async function confirm() {
    if (!acked || busy) return
    setBusy(true)
    setErrorMsg(null)
    try {
      const result = await patientMergeApi.merge({
        primary_id: primary.patient_id,
        duplicate_id: duplicate.patient_id,
        // 낙관잠금 기준값(RACE-01) — 관리자가 본 그 건수 그대로. 서버가 지금 값과 다르면 409.
        expected_counts: { primary: primary.counts, merged: duplicate.counts },
      })
      onConfirmed(result)
    } catch (e) {
      // ERR-MSG-01 — 서버 문장을 그대로 옮긴다(409 두 종류·기타 오류 모두).
      setErrorMsg(e instanceof ApiError ? e.message : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.')
      setBusy(false)
    }
  }

  return (
    <div style={dialogStyles.scrim} data-testid="dialog-scrim">
      <div role="dialog" aria-modal="true" aria-label="병합 확정" style={styles.dialog}>
        <h2 style={styles.title}>병합을 확정하기 전에 확인하세요</h2>

        <dl style={styles.items}>
          <Item label="대표 환자" value={`${primary.name} · ${primary.masked_birth_date} · ${primary.masked_phone}`} />
          <Item label="병합될 후보" value={`${duplicate.name} · ${duplicate.masked_birth_date} · ${duplicate.masked_phone}`} />
          <Item label="계정 연결" value={accountLine(primary, duplicate)} />
          <Item label="데이터 소유권" value="예약·문진·진료기록·열람 기록은 원래 자리에 남고, 대표 조회가 계보를 따라 함께 읽습니다." />
          <Item label="정정 절차" value="정정은 병합 이력 화면에서 관리자가 되돌릴 수 있습니다." />
        </dl>

        {/* MERGE-CONFIRM-03 — 비가역 고지(exact) + 「갈 길」(정정 절차 항목). 막다른 길을 만들지 않는다. */}
        <p style={styles.warnStrong}>병합 확정 후 이 화면에서 취소할 수 없습니다</p>
        {/* MERGE-UNDO-02 — 이 화면(병합 실행) 기준으로 일관되게 말한다. */}
        <p style={styles.warn}>이 화면에서는 병합을 취소할 수 없습니다.</p>
        {/* MERGE-DATA-04 · MERGE-AUDIT-01 — 무엇이 기록되는지 미리 말한다. */}
        <p style={styles.audit}>누가 · 언제 · 무엇을 합쳤는지 열람 기록에 남습니다.</p>

        {errorMsg ? (
          // MERGE-RACE-01 — 409면 실행하지 않고 [다시 확인]으로 최신 후보를 다시 읽게 한다.
          <div style={styles.raceBox}>
            <p role="alert" style={styles.raceMsg}>{errorMsg}</p>
            <button type="button" onClick={onRecheck} style={styles.recheck}>다시 확인</button>
          </div>
        ) : (
          <>
            <div style={{ marginTop: 16 }}>
              <Checkbox
                checked={acked}
                onChange={setAcked}
                ariaLabel="대표·병합될 후보와 데이터 소유권, 정정 절차를 읽었습니다"
                label="대표·병합될 후보와 데이터 소유권, 정정 절차를 읽었습니다"
              />
            </div>

            <div style={styles.actions}>
              <button type="button" onClick={onCancel} style={styles.cancel}>취소</button>
              <button
                ref={confirmRef}
                type="button"
                data-testid="danger"
                onClick={confirm}
                disabled={!acked || busy}
                aria-busy={busy}
                style={acked && !busy ? { ...styles.confirm, ...styles.danger } : { ...styles.confirm, ...styles.confirmOff }}
              >
                {busy ? '◌ 병합 중…' : '병합 확정'}
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
    <div data-dialog-item data-dialog-label={label} style={styles.item}>
      <dt style={styles.itemLabel}>{label}</dt>
      <dd style={styles.itemValue}>{value}</dd>
    </div>
  )
}

function accountLine(primary: CandidateRow, duplicate: CandidateRow): string {
  if (!primary.account_linked && duplicate.account_linked) return '병합될 후보의 계정 연결이 대표 환자로 옮겨집니다.'
  if (primary.account_linked && !duplicate.account_linked) return '대표 환자의 계정 연결은 그대로 유지됩니다.'
  return '두 기록 모두 계정 연결이 없습니다.'
}

const styles: Record<string, CSSProperties> = {
  dialog: {
    width: 'min(460px, calc(100vw - 32px))',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)',
    borderRadius: 'var(--radius-card)',
    boxShadow: '0 8px 32px rgba(16,36,58,.20)',
    padding: 20,
  },
  title: { margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--color-ink)' },
  items: { margin: '14px 0 0', display: 'flex', flexDirection: 'column', gap: 8 },
  item: { display: 'grid', gridTemplateColumns: '96px 1fr', gap: 10, fontSize: 'var(--fs-base)' },
  itemLabel: { margin: 0, color: 'var(--color-ink-muted)', fontWeight: 600 },
  itemValue: { margin: 0, color: 'var(--color-ink)', lineHeight: 1.5 },
  warnStrong: { margin: '16px 0 0', fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--color-danger)' },
  warn: { margin: '4px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  audit: { margin: '4px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
  cancel: {
    height: 34, padding: '0 16px', borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 'var(--fs-base)', fontWeight: 600, cursor: 'pointer',
  },
  confirm: {
    height: 34, padding: '0 16px', borderRadius: 8, border: 'none',
    color: '#fff', fontSize: 'var(--fs-base)', fontWeight: 700, cursor: 'pointer',
  },
  danger: { background: 'var(--color-danger)' },
  confirmOff: { background: 'var(--color-gray-past)', cursor: 'not-allowed' },
  raceBox: { marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  raceMsg: {
    margin: 0, borderLeft: '4px solid var(--color-warn)', paddingLeft: 12,
    color: 'var(--color-warn)', fontSize: 'var(--fs-base)', fontWeight: 600, lineHeight: 1.4,
  },
  recheck: {
    alignSelf: 'flex-end', height: 34, padding: '0 16px', borderRadius: 8,
    border: '1px solid var(--color-primary)', background: 'var(--color-surface)',
    color: 'var(--color-primary)', fontSize: 'var(--fs-base)', fontWeight: 700, cursor: 'pointer',
  },
}
