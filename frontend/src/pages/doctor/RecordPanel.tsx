import { useState, type CSSProperties } from 'react'
import { BusyButton } from '../../components/BusyButton'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { InlineError } from '../../components/InlineError'
import { draftStatusText, type AutoSaveStatus } from './useAutoSaveDraft'
import type { DraftFields } from './useDraftStore'
import { PhraseChips, type Phrase } from './PhraseChips'

// [DOCTOR-RECORD-01~10] 오른쪽 열 맨 위 「진료기록 작성」(과거 기록은 그 아래, HISTORY-01/G-7).
//   ⭐ 증상·진단·처치는 내부 기록, 환자 공개용 안내문만 앱에 보인다(RECORD-02) — 두 영역을 fieldset로
//      가른다. 완료는 확인 팝업을 거치고(RECORD-06), 완료 후 수정은 사유 필수·이전 내용 보존(RECORD-08~10).
//      충돌·오프라인은 성공한 척하지 않고 입력을 지키지 않는다(RECORD-09·LOAD-03).

/** [DOCTOR-PHRASE-02] 커서 자리에 끼운다 — 기존 내용을 덮어쓰지 않는다. */
export function insertAtCursor(value: string, cursor: number, insert: string): string {
  const pos = Math.max(0, Math.min(cursor, value.length))
  return value.slice(0, pos) + insert + value.slice(pos)
}

export interface RevisionView extends DraftFields {
  revised_at: string
  revised_by: string
  reason: string
}

type FieldKey = keyof DraftFields

const INTERNAL: { key: FieldKey; label: string }[] = [
  { key: 'symptoms', label: '증상' },
  { key: 'diagnosis', label: '진단' },
  { key: 'treatment', label: '처치' },
]
const PUBLIC = { key: 'patient_visible_notes' as FieldKey, label: '환자 공개용 안내문' }

export interface RecordPanelProps {
  fields: DraftFields
  onFieldsChange: (fields: DraftFields) => void
  /** live=오늘·작성 / read_only_editable=과거 완료(수정만) / read_only=과거 미완료(재개 금지). */
  mode: 'live' | 'read_only' | 'read_only_editable'
  completed: boolean
  completedAt?: string | null
  draftStatus: AutoSaveStatus
  draftSavedAt: Date | null
  draftError: string | null
  onRetryDraft: () => void
  onComplete: () => Promise<void>
  onRevise: (reason: string) => Promise<void>
  onActiveFieldChange?: (field: FieldKey | null) => void
  /** 완료 후 수정이력(최신이 위). 기본은 접혀 있고 [이전 내용 보기]로 펼친다(RECORD-10). */
  revisions?: RevisionView[]
  /** 다른 사람이 먼저 수정했을 때의 서버 문장(RECORD-09) — 성공한 척하지 않는다. */
  conflictMessage?: string | null
  offline?: boolean
  lastSyncedAt?: string | null
  /** 과거 미완료 예약을 열었을 때 — 여기서 완료시키지 않고 오늘로 보낸다(DATE-05). */
  pastIncomplete?: boolean
  // 진료문구(선택) — 있으면 작성 영역 가까이 칩으로 그린다.
  phrases?: Phrase[]
  phrasesLoading?: boolean
  phrasesError?: boolean
  onRetryPhrases?: () => void
  onManagePhrases?: () => void
}

export function RecordPanel(props: RecordPanelProps) {
  const {
    fields, onFieldsChange, mode, completed, completedAt, draftStatus, draftSavedAt, draftError,
    onRetryDraft, onComplete, onRevise, onActiveFieldChange, revisions = [], conflictMessage,
    offline = false, lastSyncedAt, pastIncomplete = false, phrases, phrasesLoading, phrasesError,
    onRetryPhrases, onManagePhrases,
  } = props

  const [confirming, setConfirming] = useState(false)
  const [revising, setRevising] = useState(false)
  const [reason, setReason] = useState('')
  const [showPrev, setShowPrev] = useState(false)
  const [active, setActive] = useState<{ field: FieldKey; pos: number } | null>(null)

  const editable = (!completed && mode === 'live') || (completed && revising)

  function setField(key: FieldKey, value: string) {
    onFieldsChange({ ...fields, [key]: value })
  }

  function trackCursor(key: FieldKey, el: HTMLTextAreaElement) {
    setActive({ field: key, pos: el.selectionStart ?? el.value.length })
    onActiveFieldChange?.(key)
  }

  function insertPhrase(text: string) {
    if (!active) return
    const next = insertAtCursor(fields[active.field], active.pos, text)
    setField(active.field, next)
    setActive({ field: active.field, pos: active.pos + text.length })
  }

  const statusLabel = draftStatusText(draftStatus, draftSavedAt)

  function renderField(key: FieldKey, label: string) {
    return (
      <label key={key} style={styles.field}>
        <span style={styles.fieldLabel}>{label}</span>
        <textarea
          aria-label={label}
          value={fields[key]}
          readOnly={!editable}
          rows={label === PUBLIC.label ? 2 : 3}
          onChange={(e) => setField(key, e.target.value)}
          onFocus={(e) => editable && trackCursor(key, e.currentTarget)}
          onSelect={(e) => editable && trackCursor(key, e.currentTarget)}
          style={editable ? styles.textarea : { ...styles.textarea, ...styles.readonly }}
        />
      </label>
    )
  }

  return (
    <section aria-label="진료기록 작성" style={styles.panel}>
      <div style={styles.headRow}>
        <h2 style={styles.heading}>진료기록 작성</h2>
        {completed ? (
          <span style={styles.completedTag}>진료 완료{completedAt ? ` · ${completedAt}` : ''}</span>
        ) : (
          statusLabel && <span role="status" style={styles.draftStatus}>{statusLabel}</span>
        )}
      </div>

      {/* [RECORD-05] 자동저장 실패·[RECORD-09] 충돌은 작성란 「위」에 붙박이로 — 성공한 척하지 않는다. */}
      {draftError && (
        <div role="alert" style={styles.alertRow}>
          <span style={styles.alertText}>{draftError}</span>
          <button type="button" onClick={onRetryDraft} style={styles.retryBtn}>다시 시도</button>
        </div>
      )}
      {conflictMessage && <InlineError message={conflictMessage} />}

      {/* [RECORD-01·02] 내부 기록(증상·진단·처치)과 공개용 안내문을 다른 fieldset로 가른다. */}
      <fieldset style={styles.fieldset}>
        <legend style={styles.legend}>내부 진료기록</legend>
        {INTERNAL.map((f) => renderField(f.key, f.label))}
      </fieldset>
      <fieldset style={styles.fieldset}>
        <legend style={styles.legend}>환자 공개</legend>
        <p style={styles.publicNote}>이 칸만 환자 앱에 보입니다</p>
        {renderField(PUBLIC.key, PUBLIC.label)}
      </fieldset>

      {phrases !== undefined && editable && (
        <PhraseChips
          phrases={phrases}
          loading={phrasesLoading}
          error={phrasesError}
          onRetry={onRetryPhrases}
          activeField={active?.field ?? null}
          onInsert={insertPhrase}
          onManage={onManagePhrases}
        />
      )}

      {pastIncomplete && (
        <p style={styles.resumeHint}>오늘 「지금 처리할 것」에서 이어서 마무리하세요</p>
      )}

      {/* ── 동작 영역 ── */}
      {!completed && mode === 'live' && (
        <div style={styles.actions}>
          {offline && <span style={styles.offlineReason}>연결이 끊겨 저장할 수 없습니다{lastSyncedAt ? ` · 기준 시각 ${lastSyncedAt}` : ''}</span>}
          <BusyButton label="진료 완료" busyLabel="완료 처리 중…" disabled={offline} onClick={() => setConfirming(true)} />
        </div>
      )}

      {completed && !revising && (
        <div style={styles.actions}>
          {revisions.length > 0 && (
            <button type="button" onClick={() => setShowPrev((v) => !v)} style={styles.ghostBtn}>
              이전 내용 보기
            </button>
          )}
          {mode === 'read_only_editable' && (
            <button type="button" onClick={() => setRevising(true)} style={styles.ghostBtn}>수정</button>
          )}
        </div>
      )}

      {completed && revising && (
        <div style={styles.reviseForm}>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>수정 사유</span>
            <input aria-label="수정 사유" value={reason} onChange={(e) => setReason(e.target.value)} style={styles.reasonInput} required />
          </label>
          <div style={styles.actions}>
            <button type="button" onClick={() => { setRevising(false); setReason('') }} style={styles.ghostBtn}>취소</button>
            <BusyButton
              label="수정 저장"
              busyLabel="저장 중…"
              disabled={reason.trim().length === 0}
              onClick={async () => {
                if (reason.trim().length === 0) return
                await onRevise(reason.trim())
                setRevising(false)
                setReason('')
              }}
            />
          </div>
        </div>
      )}

      {showPrev && revisions.length > 0 && (
        <div style={styles.prevBox}>
          {revisions.map((r, i) => (
            <div key={i} style={styles.prevItem}>
              <p style={styles.prevMeta}>{r.revised_at} · {r.revised_by} · 사유: {r.reason}</p>
              {r.symptoms && <p style={styles.prevLine}>증상: {r.symptoms}</p>}
              {r.diagnosis && <p style={styles.prevLine}>진단: {r.diagnosis}</p>}
              {r.treatment && <p style={styles.prevLine}>처치: {r.treatment}</p>}
              {r.patient_visible_notes && <p style={styles.prevLine}>안내문: {r.patient_visible_notes}</p>}
            </div>
          ))}
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title="진료를 완료할까요?"
          message="완료 후에는 사유 입력 없이 수정할 수 없습니다."
          confirmLabel="확인"
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            setConfirming(false)
            await onComplete()
          }}
        />
      )}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  panel: {
    display: 'flex', flexDirection: 'column', gap: 10, padding: 14,
    background: 'var(--color-surface)', minHeight: 0,
  },
  headRow: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  heading: { margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 800, color: 'var(--color-ink)' },
  draftStatus: { fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' },
  completedTag: { fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--color-done)' },
  alertRow: { display: 'flex', alignItems: 'center', gap: 10, borderLeft: '4px solid var(--color-warn)', paddingLeft: 12 },
  alertText: { color: 'var(--color-warn)', fontSize: 'var(--fs-base)', fontWeight: 600 },
  retryBtn: {
    height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid var(--color-warn)',
    background: 'var(--color-surface)', color: 'var(--color-warn)', fontSize: 'var(--fs-sm)', fontWeight: 700, cursor: 'pointer',
  },
  fieldset: { margin: 0, padding: 12, border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-card)' },
  legend: { padding: '0 6px', fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--color-ink-muted)' },
  publicNote: { margin: '0 0 6px', fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--color-primary)' },
  field: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 },
  fieldLabel: { fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--color-ink)' },
  textarea: {
    width: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 8,
    border: '1px solid var(--color-divider)', background: 'var(--color-surface)',
    color: 'var(--color-ink)', fontSize: 'var(--fs-lg)', fontFamily: 'inherit', resize: 'vertical',
  },
  readonly: { background: 'var(--color-bg)', color: 'var(--color-ink)' },
  resumeHint: { margin: 0, fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--color-warn)' },
  actions: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  offlineReason: { marginRight: 'auto', fontSize: 'var(--fs-sm)', color: 'var(--color-danger)', fontWeight: 600 },
  ghostBtn: {
    height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink-muted)', fontSize: 'var(--fs-sm)', fontWeight: 700, cursor: 'pointer',
  },
  reviseForm: { display: 'flex', flexDirection: 'column', gap: 8 },
  reasonInput: {
    width: '100%', boxSizing: 'border-box', height: 34, padding: '0 10px', borderRadius: 8,
    border: '1px solid var(--color-divider)', background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 'var(--fs-base)',
  },
  prevBox: { display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: 'var(--color-bg)', borderRadius: 8 },
  prevItem: { display: 'flex', flexDirection: 'column', gap: 2 },
  prevMeta: { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  prevLine: { margin: 0, fontSize: 'var(--fs-base)', color: 'var(--color-ink)' },
}
