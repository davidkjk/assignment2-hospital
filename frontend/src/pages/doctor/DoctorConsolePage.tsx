import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { homeFor, type Role } from '../../auth/roles'
import { usePanel } from '../../components/PanelHost'
import { UndoControl } from '../../components/UndoControl'
import { addPatientNote, getPatientNotes, getQuestionnaire, type PatientNote } from '../../api/patients'
import { getRecordByAppointment, listRevisions, saveDraft } from '../../api/medicalRecords'
import { completeRecord, reviseRecord } from '../../api/medicalRecords'
import { listPhrases, createPhrase, updatePhrase, deletePhrase, type Phrase } from '../../api/quickPhrases'
import { getDoctorQueue, transitionStatus, undoStatus } from '../../api/doctorConsole'
import type { SectionState } from '../patient/format'
import { QueuePanel, transitionTargetOnOpen, type DoctorQueueRow } from './QueuePanel'
import { ContextPanel } from './ContextPanel'
import { QuestionnairePanel, type ConsoleQuestionnaire } from './QuestionnairePanel'
import { HistoryPanel } from './HistoryPanel'
import { RecordPanel, type RevisionView } from './RecordPanel'
import { NotePanel } from './NotePanel'
import { PhraseManagePanel } from './PhraseManagePanel'
import { ColumnResizer, useColumnWidths } from './ColumnResizer'
import { emptyFields, readDraft, writeDraft, clearDraft, clearAllDrafts, type DraftFields } from './useDraftStore'
import { useAutoSaveDraft } from './useAutoSaveDraft'

// [DOCTOR-*] /doctor/console — 의사의 기본 화면. ⭐ 선택 상태(어느 예약을 열었나)는 이 페이지 하나가
//   소유한다 — 패널들이 각자 예약 ID를 들면 CONTEXT-02가 조용히 깨져 남의 진단을 쓰게 된다. 조회는
//   패널별 쿼리로 나눠, 한 패널이 죽어도 작성 입력이 살아 있게 한다(LOAD-02).

function todayStr(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function pickFields(record: Record<string, unknown> | null | undefined): DraftFields {
  if (!record) return emptyFields()
  return {
    symptoms: String(record.symptoms ?? ''),
    diagnosis: String(record.diagnosis ?? ''),
    treatment: String(record.treatment ?? ''),
    patient_visible_notes: String(record.patient_visible_notes ?? ''),
  }
}

export function DoctorConsolePage() {
  const { staff } = useAuth()
  const role: Role = staff?.role ?? 'receptionist'
  const staffId = staff?.staffId ?? ''
  const navigate = useNavigate()
  const client = useQueryClient()
  const { openPanel } = usePanel()
  const { appointmentId: deepLinkId } = useParams()

  const today = todayStr()
  const [date, setDate] = useState(today)
  const isPast = date < today
  const [selectedId, setSelectedId] = useState<string | null>(deepLinkId ?? null)
  const { widths, drag, reset } = useColumnWidths()

  // ── 오늘/과거 대기 목록 (DOCTOR-QUEUE-01·DATE-01) ──────────────────────────
  const queueQ = useQuery({
    queryKey: ['doctor-queue', staffId, date],
    queryFn: () => getDoctorQueue(staffId, isPast ? date : undefined),
    enabled: role === 'doctor' && staffId !== '',
  })
  const queueRows: DoctorQueueRow[] = (queueQ.data?.rows ?? []).map((r) => ({
    id: r.id,
    patient_id: r.patient_id,
    masked_name: r.masked_name,
    queue_position: r.queue_position,
    waiting_started_at: r.waiting_started_at,
    status: r.status,
  }))
  const selectedRow = queueRows.find((r) => r.id === selectedId) ?? null
  const selectedApiRow = (queueQ.data?.rows ?? []).find((r) => r.id === selectedId)

  // ── 선택 예약의 진료기록·문진·과거기록·메모 (패널별로 나눠 건다, LOAD-02) ──
  const recordQ = useQuery({
    queryKey: ['doctor-record', selectedId],
    queryFn: () => getRecordByAppointment(selectedId as string),
    enabled: Boolean(selectedId),
  })
  const record = recordQ.data as Record<string, unknown> | null | undefined
  const completed = Boolean(record?.is_completed)
  const recordId = record?.id ? String(record.id) : record?.record_id ? String(record.record_id) : null

  const qnrQ = useQuery({
    queryKey: ['doctor-qnr', selectedId],
    queryFn: () => getQuestionnaire(selectedId as string),
    enabled: Boolean(selectedId),
  })
  const notesQ = useQuery({
    queryKey: ['doctor-notes', selectedRow?.patient_id],
    queryFn: () => getPatientNotes(selectedRow!.patient_id),
    enabled: Boolean(selectedRow?.patient_id),
  })
  const revisionsQ = useQuery({
    queryKey: ['doctor-revisions', recordId],
    queryFn: () => listRevisions(recordId as string),
    enabled: Boolean(recordId) && completed,
  })
  const phrasesQ = useQuery({
    queryKey: ['doctor-phrases', staffId],
    queryFn: () => listPhrases(staffId),
    enabled: role === 'doctor',
  })

  // ── 작성 초안 상태(페이지 소유) + 되살리기 배너 (DRAFT-04·05) ──────────────
  const [fields, setFields] = useState<DraftFields>(emptyFields())
  const [recovered, setRecovered] = useState<{ at: string } | null>(null)

  useEffect(() => {
    // 선택이 바뀌면 서버본을 기준으로 초안을 다시 잡되, 더 최근의 브라우저본이 있으면 되살린다(DRAFT-04).
    if (!selectedId) {
      setFields(emptyFields())
      setRecovered(null)
      return
    }
    const server = pickFields(record)
    const local = readDraft(staffId, selectedId)
    const serverAt = record?.updated_at ? String(record.updated_at) : ''
    if (local && local.savedAt > serverAt) {
      setFields(local.fields)
      setRecovered({ at: local.savedAt })
    } else {
      setFields(server)
      setRecovered(null)
    }
  }, [selectedId, record, staffId])

  const writable = !isPast && !completed
  const autosave = useAutoSaveDraft({
    fields,
    enabled: writable && Boolean(selectedId),
    onSave: async (f) => {
      if (!selectedId) return
      writeDraft(staffId, selectedId, f) // 브라우저엔 먼저(마지막 한 글자까지, DRAFT-01)
      await saveDraft({ appointment_id: selectedId, ...f })
    },
  })

  function onFieldsChange(next: DraftFields) {
    setFields(next)
    if (selectedId) writeDraft(staffId, selectedId, next) // 글자가 바뀔 때마다 브라우저에(DRAFT-01)
  }

  // ── 행을 여는 행위 = 상태 전이 (DOCTOR-START-01) ───────────────────────────
  const transition = useMutation({
    mutationFn: (row: DoctorQueueRow) =>
      transitionStatus(row.id, '진료중', selectedApiRow?.updated_at ?? ''),
    onSettled: () => client.invalidateQueries({ queryKey: ['doctor-queue', staffId, date] }),
  })

  function onOpen(row: DoctorQueueRow) {
    setSelectedId(row.id)
    // 진료대기일 때만, 과거가 아닐 때만 전이한다. 낙관적으로 먼저 그리지 않는다(P-07).
    if (!isPast && transitionTargetOnOpen(row.status) === '진료중') {
      transition.mutate(row)
    }
  }

  // ── 완료·수정·되돌리기 ─────────────────────────────────────────────────────
  const complete = useMutation({
    mutationFn: async () => {
      if (!recordId) {
        const saved = await saveDraft({ appointment_id: selectedId as string, ...fields })
        return completeRecord(saved.record_id, { expected_updated_at: String(record?.updated_at ?? new Date().toISOString()) })
      }
      return completeRecord(recordId, { expected_updated_at: String(record?.updated_at ?? '') })
    },
    onSuccess: () => {
      if (selectedId) clearDraft(staffId, selectedId) // 완료 즉시 브라우저 초안을 지운다(DRAFT-03 ①)
      client.invalidateQueries({ queryKey: ['doctor-record', selectedId] })
      client.invalidateQueries({ queryKey: ['doctor-queue', staffId, date] })
    },
  })
  const [conflict, setConflict] = useState<string | null>(null)
  const revise = useMutation({
    mutationFn: (reason: string) =>
      reviseRecord(recordId as string, { ...fields, reason, expected_updated_at: String(record?.updated_at ?? '') }),
    onSuccess: () => {
      setConflict(null)
      client.invalidateQueries({ queryKey: ['doctor-record', selectedId] })
      client.invalidateQueries({ queryKey: ['doctor-revisions', recordId] })
    },
    onError: (e) => setConflict(e instanceof Error ? e.message : '수정하지 못했습니다.'),
  })

  const notesState: SectionState<PatientNote[]> = {
    loading: notesQ.isLoading && Boolean(selectedRow),
    error: notesQ.isError,
    data: notesQ.data,
    retry: () => void notesQ.refetch(),
  }
  const addNote = useMutation({
    mutationFn: (content: string) => addPatientNote(selectedRow!.patient_id, content),
    onSuccess: () => client.invalidateQueries({ queryKey: ['doctor-notes', selectedRow?.patient_id] }),
  })

  // ── 진료문구 관리 인라인 패널 (PHRASE-03·04) ──────────────────────────────
  function openPhraseManage() {
    openPanel({
      title: '진료문구 관리',
      content: (
        <PhraseManagePanel
          phrases={phrasesQ.data ?? []}
          onCreate={async (text) => { await createPhrase(text); await phrasesQ.refetch() }}
          onUpdate={async (id, text) => { await updatePhrase(id, text); await phrasesQ.refetch() }}
          onDelete={async (id) => { await deletePhrase(id); await phrasesQ.refetch() }}
        />
      ),
    })
  }

  const revisions: RevisionView[] = useMemo(
    () =>
      (revisionsQ.data ?? []).map((r) => ({
        symptoms: String(r.symptoms ?? ''),
        diagnosis: String(r.diagnosis ?? ''),
        treatment: String(r.treatment ?? ''),
        patient_visible_notes: String(r.patient_visible_notes ?? ''),
        revised_at: String(r.revised_at ?? ''),
        revised_by: String(r.revised_by ?? ''),
        reason: String(r.reason ?? ''),
      })),
    [revisionsQ.data],
  )

  // ── 권한 (DOCTOR-SHELL-02): 의사가 아니면 화면에서도 막고 갈 길을 준다 ──────
  if (role !== 'doctor') {
    return (
      <section aria-label="의사 진료 콘솔" style={styles.blocked}>
        <p style={styles.blockedText}>이 화면을 볼 권한이 없습니다</p>
        <button type="button" onClick={() => navigate(homeFor(role))} style={styles.escape}>
          오늘의 현황으로
        </button>
      </section>
    )
  }

  const recordMode = completed ? 'read_only_editable' : isPast ? 'read_only' : 'live'
  const qnr = qnrQ.data?.questionnaire
  const consoleQnr: ConsoleQuestionnaire | null = qnr
    ? {
        submitted_at: qnr.submitted_at,
        answers: Object.entries(qnr.answers ?? {}).map(([question_id, value]) => ({
          question_id,
          question_text: question_id,
          value: value == null ? null : String(value),
        })),
      }
    : null

  return (
    <section aria-label="의사 진료 콘솔" style={styles.page}>
      <div style={styles.toolbar}>
        <label style={styles.dateLabel}>
          진료 날짜
          <input
            type="date"
            aria-label="진료 날짜"
            value={date}
            max={today}
            onChange={(e) => {
              if (e.target.value && e.target.value <= today) setDate(e.target.value)
            }}
            style={styles.dateInput}
          />
        </label>
        <button type="button" onClick={reset} style={styles.resetBtn}>기본값으로</button>
        {selectedRow && (
          <UndoControl
            requiresReason
            onUndo={(reason) => selectedId && undoStatus(selectedId, reason)}
          />
        )}
      </div>

      <div style={styles.columns}>
        <div style={{ ...styles.col, flex: `0 0 ${widths.queue}px` }} data-col="queue" data-width={widths.queue}>
          <QueuePanel
            rows={queueRows}
            selectedId={selectedId}
            onOpen={onOpen}
            loading={queueQ.isLoading}
            error={queueQ.isError}
            onRetry={() => void queueQ.refetch()}
          />
        </div>
        <ColumnResizer boundary={0} onDrag={drag} />

        <div style={{ ...styles.col, flex: `0 0 ${widths.context}px` }} data-col="context" data-width={widths.context}>
          <ContextPanel
            patient={selectedRow ? { name: selectedRow.masked_name, birth_date: '', gender: null } : null}
            meta={selectedRow ? { status: selectedRow.status } : null}
            reason={record?.reason ? String(record.reason) : null}
            loading={Boolean(selectedId) && recordQ.isLoading}
          />
          {selectedId && (
            <QuestionnairePanel
              canRead={role === 'doctor'}
              loading={qnrQ.isLoading}
              error={qnrQ.isError}
              onRetry={() => void qnrQ.refetch()}
              questionnaire={consoleQnr}
            />
          )}
          {selectedRow && <NotePanel state={notesState} onAdd={(c) => addNote.mutateAsync(c).then(() => undefined)} />}
        </div>
        <ColumnResizer boundary={1} onDrag={drag} />

        <div style={{ ...styles.col, ...styles.recordCol, flex: `1 1 ${widths.record}px` }} data-col="record" data-width={widths.record}>
          {selectedId ? (
            <>
              {recovered && (
                <div role="status" style={styles.recovered}>
                  <span>저장하지 못한 내용을 되살렸습니다 · {recovered.at.slice(11, 16)}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setFields(pickFields(record))
                      setRecovered(null)
                    }}
                    style={styles.recoveredBtn}
                  >
                    되살린 내용 취소
                  </button>
                </div>
              )}
              <RecordPanel
                fields={fields}
                onFieldsChange={onFieldsChange}
                mode={recordMode}
                completed={completed}
                completedAt={record?.completed_at ? String(record.completed_at) : null}
                draftStatus={autosave.status}
                draftSavedAt={autosave.savedAt}
                draftError={autosave.error}
                onRetryDraft={autosave.retry}
                onComplete={() => complete.mutateAsync().then(() => undefined)}
                onRevise={(reason) => revise.mutateAsync(reason).then(() => undefined)}
                revisions={revisions}
                conflictMessage={conflict}
                pastIncomplete={isPast && !completed}
                phrases={phrasesQ.data ?? []}
                phrasesLoading={phrasesQ.isLoading}
                phrasesError={phrasesQ.isError}
                onRetryPhrases={() => void phrasesQ.refetch()}
                onManagePhrases={openPhraseManage}
              />
              <HistoryPanel
                loading={false}
                records={[]}
              />
            </>
          ) : (
            <p style={styles.pickHint}>왼쪽에서 진료할 환자를 골라 진료기록을 작성하세요</p>
          )}
        </div>
      </div>
    </section>
  )
}

// 로그아웃·자동 로그아웃 시 브라우저 초안을 전부 지우는 통로(DRAFT-03 ②③). ⛔ 실제 호출은 셸의
// signOut·useIdleLogout이 소유한다(코디 배선) — 여기서는 그 통로만 내보낸다. 미배선 시 개인정보 잔류.
export { clearAllDrafts as clearConsoleDraftsOnSignOut }

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  toolbar: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
    borderBottom: '1px solid var(--color-divider)', background: 'var(--color-surface)',
  },
  dateLabel: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--color-ink-muted)' },
  dateInput: {
    height: 30, padding: '0 8px', borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 'var(--fs-base)',
  },
  resetBtn: {
    height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink-muted)', fontSize: 'var(--fs-sm)', fontWeight: 700, cursor: 'pointer',
  },
  columns: { display: 'flex', flex: 1, minHeight: 0 },
  col: { display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' },
  recordCol: { display: 'flex', flexDirection: 'column', gap: 10, padding: 0 },
  recovered: {
    display: 'flex', alignItems: 'center', gap: 10, margin: 14, marginBottom: 0, padding: '8px 12px',
    borderRadius: 8, background: 'var(--color-primary-wash)', color: 'var(--color-primary)', fontSize: 'var(--fs-sm)', fontWeight: 600,
  },
  recoveredBtn: {
    height: 26, padding: '0 10px', borderRadius: 6, border: '1px solid var(--color-primary)',
    background: 'var(--color-surface)', color: 'var(--color-primary)', fontSize: 'var(--fs-sm)', fontWeight: 700, cursor: 'pointer',
  },
  pickHint: { margin: 0, padding: 24, fontSize: 'var(--fs-base)', color: 'var(--color-ink-muted)' },
  blocked: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12, padding: 24,
    background: 'var(--color-surface)', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-card)',
  },
  blockedText: { margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--color-ink)' },
  escape: {
    height: 34, padding: '0 16px', borderRadius: 8, border: 'none',
    background: 'var(--color-primary)', color: '#fff', fontSize: 'var(--fs-base)', fontWeight: 600, cursor: 'pointer',
  },
}
