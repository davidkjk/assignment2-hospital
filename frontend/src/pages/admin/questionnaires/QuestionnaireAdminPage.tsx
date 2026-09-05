import { useEffect, useState, type CSSProperties } from 'react'
import { hospitalParts } from '../../../lib/clock'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useSearchParams } from 'react-router-dom'
import { RequireRole } from '../../../auth/RequireRole'
import { ADMIN_ONLY } from '../../../auth/roles'
import { useAuth } from '../../../auth/useAuth'
import { useConnectivity } from '../../../lib/connectivity'
import { ApiError, isSessionExpiry, rememberReturn } from '../../../api/httpClient'
import { EmptyState } from '../../../components/EmptyState'
import { Checkbox, Select, TextArea, btnPrimary, btnGhost } from '../../../components/staff-ui'
import { dialogStyles } from '../../../components/ConfirmDialog'
import {
  questionnaireAdmin,
  MAX_QUESTIONS,
  QUESTION_TYPES,
  SHOW_TO,
  type ActiveVersion,
  type DepartmentForm,
  type Question,
  type QuestionType,
  type SavedVersion,
  type ShowTo,
  type VersionSummary,
} from '../../../api/questionnaireAdmin'

// [QADM-*] 문진표 관리 — 관리자 전용. 목업 81의 3칸(진료과 · 편집기 · 버전 기록).
// ⭐ 상태기계 하나로 목록·편집·버전 기록·확인창을 한 화면에서 다룬다(merge 화면과 같은 통합 방식).
// ⭐ 저장은 덮어쓰기가 아니라 base 위에 새 불변 버전을 만든다(결정12). PUT·DELETE는 아예 없다(AD-065·066).
// ⛔ 버전 삭제·숨김·이름변경 UI 없음. 환자 답변 열람 창구 없음(결정#14) — 관리자는 양식만 다룬다.

const TYPE_LABEL: Record<QuestionType, string> = {
  short_text: '단답형',
  long_text: '장문형',
  yes_no: '예/아니오',
}
const SHOW_LABEL: Record<ShowTo, string> = {
  all: '모든 환자',
  female: '여성 환자만',
  male: '남성 환자만',
}

function formatStamp(iso: string): string {
  // 병원 시간대 절대값 — '몇 분 전' 상대값을 쓰지 않는다.
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  // [TIME-TZ-01] 서버가 준 순간을 병원 달력·시계로 읽는다.
  const hp = hospitalParts(d)
  return `${hp.y}.${hp.mo}.${hp.d} ${hp.hh}:${hp.mm}`
}

type SaveError =
  | { kind: 'error'; message: string }
  | { kind: 'conflict'; message: string }
  | { kind: 'expired'; message: string }

export function QuestionnaireAdminPage() {
  return (
    <RequireRole roles={ADMIN_ONLY}>
      <QuestionnaireAdminInner />
    </RequireRole>
  )
}

function QuestionnaireAdminInner() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { online } = useConnectivity()
  const { staff } = useAuth()

  const selectedDeptId = searchParams.get('department_id')

  const departmentsQ = useQuery({
    queryKey: ['qna-departments'],
    queryFn: questionnaireAdmin.listDepartments,
    refetchOnWindowFocus: false,
  })

  const formQ = useQuery({
    queryKey: ['qna-form', selectedDeptId],
    queryFn: () => questionnaireAdmin.getForm(selectedDeptId as string),
    enabled: !!selectedDeptId,
    refetchOnWindowFocus: false,
  })

  // 편집 상태 — 조회한 폼에서 씨앗을 얻되, 저장 성공 뒤엔 서버 재조회 없이 로컬로 굴린다.
  const [questions, setQuestions] = useState<Question[]>([])
  const [head, setHead] = useState<ActiveVersion | null>(null)
  const [versions, setVersions] = useState<VersionSummary[]>([])
  const [dirty, setDirty] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<SaveError | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)

  const ready = !!formQ.data && formQ.data.department_id === selectedDeptId
  const form = ready ? (formQ.data as DepartmentForm) : null

  // 새 진료과를 정상 조회할 때마다 편집 상태를 그 폼으로 초기화한다.
  useEffect(() => {
    const f = formQ.data
    if (!f) return
    setQuestions(f.active_version?.questions ?? [])
    setHead(f.active_version)
    setVersions(f.versions)
    setDirty(false)
    setFlash(null)
    setSaveError(null)
    setSaveOpen(false)
    setPreviewId(null)
  }, [formQ.data])

  const activeRow = versions.find((v) => v.is_active) ?? null
  const lastSavedAt = activeRow?.created_at ?? null
  const lastSavedBy = activeRow?.created_by_name ?? null

  function performSwitch(deptId: string) {
    setPendingSwitch(null)
    setSearchParams({ department_id: deptId })
  }

  function selectDept(deptId: string) {
    if (deptId === selectedDeptId) return
    if (dirty) {
      setPendingSwitch(deptId)
      return
    }
    performSwitch(deptId)
  }

  function mutateQuestions(next: Question[]) {
    setQuestions(next)
    setDirty(true)
    setFlash(null)
  }

  // [지금 편집 취소] 저장 전 변경을 방금 불러온(또는 마지막 저장한) 버전으로 되돌린다.
  // ⛔ 불변 버전을 건드리지 않는다 — 편집 중인 로컬 초안만 원복(QADM-VERSION-04와 무관).
  function revertDraft() {
    setQuestions(head?.questions ?? [])
    setDirty(false)
    setSaveError(null)
    setFlash('편집한 내용을 되돌렸습니다.')
  }

  // [F-9][QADM-VERSION-04] 과거 버전을 편집기로 복사 — 되돌리기가 아니라, 그 문항을 편집기에 실어
  //   [새 버전으로 저장]으로 확정하는 경로. 미리보기에서 옛 버전을 볼 수만 있고 쓸 수 없으면 막다른 길이다.
  function copyVersionToEditor(qs: Question[]) {
    mutateQuestions(qs.map((q) => ({ ...q, required: q.required ?? false })))
    setPreviewId(null)
    setFlash('이 버전 문항을 편집기로 가져왔습니다. 고친 뒤 [새 버전으로 저장]으로 확정하세요.')
  }

  function editQuestion(index: number, patch: Partial<Question>) {
    mutateQuestions(questions.map((q, i) => (i === index ? { ...q, ...patch } : q)))
  }

  function moveQuestion(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= questions.length) return
    const next = [...questions]
    ;[next[index], next[target]] = [next[target], next[index]]
    mutateQuestions(next)
  }

  function removeQuestion(index: number) {
    mutateQuestions(questions.filter((_, i) => i !== index))
  }

  function addQuestion() {
    if (questions.length >= MAX_QUESTIONS) return
    const fresh: Question = {
      // 삭제한 ID는 재사용하지 않는다 — 시각을 섞어 새 안정 ID를 발급한다(QNR-ID-07).
      id: `Q-NEW-${Date.now()}-${questions.length + 1}`,
      text: '',
      type: 'short_text',
      required: false,
      show_to: 'all',
    }
    mutateQuestions([...questions, fresh])
  }

  async function saveVersion() {
    if (busy) return
    setBusy(true)
    try {
      const saved: SavedVersion = await questionnaireAdmin.saveVersion(selectedDeptId as string, {
        questions,
        base_version_id: head?.id ?? null,
      })
      setSaveOpen(false)
      setHead({ id: saved.id, version_no: saved.version_no, questions: saved.questions })
      setQuestions(saved.questions)
      setVersions((prev) => [
        {
          id: saved.id,
          version_no: saved.version_no,
          is_active: true,
          created_at: saved.created_at,
          created_by_name: saved.created_by_name,
          question_count: saved.questions.length,
        },
        ...prev.map((v) => ({ ...v, is_active: false })),
      ])
      setDirty(false)
      setSaveError(null)
      setFlash(
        saved.questions.length === 0
          ? '이 진료과는 현재 문진을 받지 않습니다. 이전 답변은 남아 있습니다.'
          : `v${saved.version_no}로 저장했습니다. 과거 답변은 그대로 보존됩니다.`,
      )
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('저장하지 못했습니다. 잠시 후 다시 시도해주세요.', 0)
      setSaveOpen(false)
      if (isSessionExpiry(err.status, online)) {
        // 자동 재제출하지 않는다 — 돌아올 곳만 남기고 다시 로그인 길을 준다(QADM-STATE-04).
        if (staff) rememberReturn(location.pathname, staff.staffId)
        setSaveError({ kind: 'expired', message: err.message })
      } else if (err.status === 409) {
        setSaveError({ kind: 'conflict', message: err.message })
      } else {
        setSaveError({ kind: 'error', message: err.message })
      }
    } finally {
      setBusy(false)
    }
  }

  const nextVersionNo = (head?.version_no ?? 0) + 1

  return (
    <section
      aria-label="문진표 관리"
      data-location={`${location.pathname}${location.search}`}
      style={styles.page}
    >
      <div style={styles.grid}>
        {/* ── 왼쪽: 진료과 목록 — 서버가 준 순서 그대로, 화면에서 다시 정렬하지 않는다. ── */}
        <nav style={styles.col} aria-label="진료과 선택">
          {departmentsQ.isError ? (
            <EmptyState kind="error" onRetry={() => void departmentsQ.refetch()} />
          ) : !departmentsQ.data ? (
            <p style={styles.historyEmpty}>진료과를 불러오는 중입니다</p>
          ) : (
            <ul role="list" aria-label="진료과" style={styles.deptList}>
              {departmentsQ.data.map((d) => {
                const active = d.id === selectedDeptId
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => selectDept(d.id)}
                      aria-current={active ? 'true' : undefined}
                      style={{ ...styles.deptBtn, ...(active ? styles.deptBtnActive : null) }}
                    >
                      <span data-testid="dept-name" style={styles.deptName}>{d.name}</span>
                      <span style={styles.deptMeta}>
                        {d.active_version ? `현재 v${d.active_version} · ${d.question_count}문항` : '문진 없음'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </nav>

        {/* ── 가운데: 편집기 ── */}
        <section style={styles.col} aria-label="문진표 편집">
          {!selectedDeptId && (
            <div style={styles.placeholder}>
              <p style={styles.placeholderTitle}>진료과를 선택하면 문진표를 만들고 고칠 수 있습니다</p>
            </div>
          )}

          {selectedDeptId && formQ.isError && (
            <EmptyState kind="error" onRetry={() => void formQ.refetch()} />
          )}

          {selectedDeptId && !formQ.isError && !ready && (
            <div aria-busy="true" style={styles.loadingWrap}>
              <p style={styles.loadingText}>문진표를 불러오는 중입니다</p>
              <div data-testid="skeleton" style={styles.skeleton} />
              <div data-testid="skeleton" style={styles.skeleton} />
            </div>
          )}

          {form && (
            <Editor
              form={form}
              head={head}
              questions={questions}
              dirty={dirty}
              online={online}
              lastSavedAt={lastSavedAt}
              lastSavedBy={lastSavedBy}
              flash={flash}
              saveError={saveError}
              onEdit={editQuestion}
              onMove={moveQuestion}
              onRemove={removeQuestion}
              onAdd={addQuestion}
              onOpenSave={() => { setSaveError(null); setSaveOpen(true) }}
              onRevert={revertDraft}
              onReload={() => void formQ.refetch()}
            />
          )}
        </section>

        {/* ── 오른쪽: 버전 기록 — 읽기 전용. 번호·시각·직원·문항 수만(AD-066). ── */}
        {form && (
          <VersionHistory
            versions={versions}
            onPreview={(id) => setPreviewId(id)}
            previewId={previewId}
            onClosePreview={() => setPreviewId(null)}
            onCopyToEditor={copyVersionToEditor}
          />
        )}
      </div>

      {saveOpen && form && (
        <SaveConfirmDialog
          currentNo={head?.version_no ?? 0}
          nextNo={nextVersionNo}
          busy={busy}
          onCancel={() => setSaveOpen(false)}
          onConfirm={() => void saveVersion()}
        />
      )}

      {pendingSwitch && (
        <UnsavedGuardDialog
          onKeepEditing={() => setPendingSwitch(null)}
          onDiscard={() => performSwitch(pendingSwitch)}
        />
      )}
    </section>
  )
}

// ── 편집기 ─────────────────────────────────────────────

interface EditorProps {
  form: DepartmentForm
  head: ActiveVersion | null
  questions: Question[]
  dirty: boolean
  online: boolean
  lastSavedAt: string | null
  lastSavedBy: string | null
  flash: string | null
  saveError: SaveError | null
  onEdit(index: number, patch: Partial<Question>): void
  onMove(index: number, dir: -1 | 1): void
  onRemove(index: number): void
  onAdd(): void
  onOpenSave(): void
  onRevert(): void
  onReload(): void
}

function Editor(props: EditorProps) {
  const { form, head, questions, dirty, online, lastSavedAt, lastSavedBy, flash, saveError, onReload } = props
  const atMax = questions.length >= MAX_QUESTIONS

  return (
    <div style={styles.editor}>
      <div style={styles.editorHead}>
        <div style={styles.editorTitleRow}>
          <h2 style={styles.editorTitle}>{form.department_name} 문진표</h2>
          {head && <span style={styles.currentBadge}>현재 사용 v{head.version_no}</span>}
          {dirty && <span style={styles.dirtyBadge}>저장되지 않은 변경</span>}
        </div>
        <p style={styles.editorSub}>
          {lastSavedAt && (
            <span>마지막 저장 {formatStamp(lastSavedAt)}{lastSavedBy ? ` · ${lastSavedBy}` : ''}</span>
          )}
          {lastSavedAt && <span aria-hidden="true"> · </span>}
          <span>저장하면 새 버전으로 남습니다</span>
        </p>
        {/* 저장 자체는 언제나 여기서 연다 — 변경이 없어도, 문항이 0개여도. */}
        <div style={styles.editorActions}>
          <button
            type="button"
            onClick={props.onRevert}
            disabled={!dirty}
            className={btnGhost}
          >
            되돌리기
          </button>
          <button
            type="button"
            onClick={props.onOpenSave}
            disabled={!online}
            className={btnPrimary}
          >
            새 버전으로 저장
          </button>
        </div>
        {!online && (
          <div role="status" style={styles.offline}>
            <p style={styles.offlineLine}>인터넷이 연결되어 있지 않습니다</p>
            <p style={styles.offlineLine}>연결되면 문진표를 저장할 수 있습니다</p>
          </div>
        )}
      </div>

      {flash && <p role="status" style={styles.flash}>{flash}</p>}

      {saveError?.kind === 'error' && <p role="alert" style={styles.alert}>{saveError.message}</p>}
      {saveError?.kind === 'conflict' && (
        <div role="alert" style={styles.conflict}>
          <p style={styles.conflictMsg}>{saveError.message}</p>
          <button type="button" onClick={onReload} style={styles.conflictBtn}>최신 문진표 불러오기</button>
        </div>
      )}
      {saveError?.kind === 'expired' && (
        <div role="alert" style={styles.conflict}>
          <p style={styles.conflictMsg}>{saveError.message} 저장하지 않은 입력은 그대로 남아 있습니다.</p>
          <a href="/login" style={styles.conflictBtn}>다시 로그인</a>
        </div>
      )}

      {/* 「병원이 꼭 확인」의 뜻을 한 번만 풀어 둔다 — 환자 입력을 막는 스위치가 아니다. */}
      <p style={styles.hint}>
        문항 ID는 답변을 붙이는 열쇠입니다. 문구를 고쳐도 이미 받은 답변은 사라지지 않습니다.
      </p>
      <p style={styles.hint}>
        병원이 꼭 확인 표시는 환자 입력을 막는 뜻이 아닙니다. 의사 화면에 확인이 필요하다고 알리는 표시입니다.
      </p>

      {questions.length === 0 ? (
        <div style={styles.emptyForm}>
          <p style={styles.emptyFormTitle}>아직 문진표가 없습니다</p>
          <p style={styles.emptyFormHint}>0문항으로 저장하면 이 진료과는 문진을 받지 않습니다</p>
          <button type="button" onClick={props.onAdd} className={btnPrimary}>첫 문항 추가</button>
        </div>
      ) : (
        <>
          <ol style={styles.rows}>
            {questions.map((q, i) => (
              <QuestionRow
                key={q.id}
                index={i}
                question={q}
                isFirst={i === 0}
                isLast={i === questions.length - 1}
                onEdit={(patch) => props.onEdit(i, patch)}
                onUp={() => props.onMove(i, -1)}
                onDown={() => props.onMove(i, 1)}
                onRemove={() => props.onRemove(i)}
              />
            ))}
          </ol>

          <div style={styles.countRow}>
            <span style={styles.countText}>현재 {questions.length} / 최대 {MAX_QUESTIONS}</span>
            <button
              type="button"
              onClick={props.onAdd}
              disabled={atMax}
              className={btnGhost}
            >
              문항 추가
            </button>
          </div>
          {atMax && (
            <div style={styles.maxNotice}>
              <p style={styles.maxNoticeMsg}>최대 30문항까지입니다</p>
              <button type="button" onClick={() => props.onRemove(questions.length - 1)} style={styles.reduceBtn}>
                문항 수 줄이기
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── 문항 한 줄 ─────────────────────────────────────────

interface QuestionRowProps {
  index: number
  question: Question
  isFirst: boolean
  isLast: boolean
  onEdit(patch: Partial<Question>): void
  onUp(): void
  onDown(): void
  onRemove(): void
}

function QuestionRow({ index, question, isFirst, isLast, onEdit, onUp, onDown, onRemove }: QuestionRowProps) {
  const n = index + 1
  return (
    <li role="group" aria-label={`문항 ${n}`} style={styles.row}>
      <div style={styles.rowHead}>
        <span data-testid="question-id" style={styles.qid}>{question.id}</span>
        <div style={styles.rowMoveGroup}>
          <button type="button" onClick={onUp} disabled={isFirst} style={styles.moveBtn}>위로</button>
          <button type="button" onClick={onDown} disabled={isLast} style={styles.moveBtn}>아래로</button>
          <button type="button" onClick={onRemove} style={styles.removeBtn}>삭제</button>
        </div>
      </div>

      <label style={styles.field}>
        <span style={styles.fieldLabel}>질문 문구</span>
        <TextArea
          ariaLabel={`질문 문구 ${n}`}
          value={question.text}
          onChange={(text) => onEdit({ text })}
          rows={2}
        />
      </label>

      <div style={styles.fieldRow}>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>질문 종류</span>
          <Select
            ariaLabel={`질문 종류 ${n}`}
            value={question.type}
            onChange={(v) => onEdit({ type: v as QuestionType })}
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </Select>
        </label>

        <label style={styles.field}>
          <span style={styles.fieldLabel}>보일 대상</span>
          <Select
            ariaLabel={`보일 대상 ${n}`}
            value={question.show_to}
            onChange={(v) => onEdit({ show_to: v as ShowTo })}
          >
            {SHOW_TO.map((s) => (
              <option key={s} value={s}>{SHOW_LABEL[s]}</option>
            ))}
          </Select>
        </label>

        <div style={styles.checkField}>
          <Checkbox
            ariaLabel={`병원이 꼭 확인 ${n}`}
            label="병원이 꼭 확인"
            checked={question.required}
            onChange={(required) => onEdit({ required })}
          />
        </div>
      </div>
    </li>
  )
}

// ── 버전 기록(읽기 전용) ────────────────────────────────

interface VersionHistoryProps {
  versions: VersionSummary[]
  previewId: string | null
  onPreview(id: string): void
  onClosePreview(): void
  onCopyToEditor(questions: Question[]): void
}

function VersionHistory({ versions, previewId, onPreview, onClosePreview, onCopyToEditor }: VersionHistoryProps) {
  const previewQ = useQuery({
    queryKey: ['qna-version', previewId],
    queryFn: () => questionnaireAdmin.getVersion(previewId as string),
    enabled: !!previewId,
    refetchOnWindowFocus: false,
  })

  return (
    <aside style={styles.col}>
      <section role="region" aria-label="버전 기록" style={styles.history}>
        <p style={styles.colLabel}>버전 기록</p>
        {versions.length === 0 ? (
          <p style={styles.historyEmpty}>저장한 버전이 아직 없습니다</p>
        ) : (
          <ul style={styles.versionList}>
            {versions.map((v) => (
              <li key={v.id} style={styles.versionItem}>
                <div style={styles.versionTop}>
                  <span style={styles.versionNo}>v{v.version_no}</span>
                  {v.is_active && <span style={styles.versionActive}>현재 사용</span>}
                </div>
                <p style={styles.versionMeta}>{formatStamp(v.created_at)}</p>
                {/* 현재 버전의 저장자는 편집기 머리의 「마지막 저장」이 진다 — 이력 행에선 과거 버전만 저장자를 보인다. */}
                <p style={styles.versionMeta}>
                  {v.is_active ? `${v.question_count}문항` : `${v.created_by_name} · ${v.question_count}문항`}
                </p>
                <button type="button" onClick={() => onPreview(v.id)} style={styles.viewBtn}>
                  v{v.version_no} 문항 보기
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {previewId && previewQ.data && (
        <section role="region" aria-label={`v${previewQ.data.version_no} 문항`} style={styles.preview}>
          <div style={styles.previewHead}>
            <p style={styles.previewTitle}>v{previewQ.data.version_no} 문항 (읽기 전용)</p>
            <button type="button" onClick={onClosePreview} style={styles.previewClose}>미리보기 닫기</button>
          </div>
          {previewQ.data.questions.length === 0 ? (
            <p style={styles.previewEmpty}>이 버전에는 문항이 없습니다</p>
          ) : (
            <ol style={styles.previewList}>
              {previewQ.data.questions.map((q) => (
                <li key={q.id} style={styles.previewItem}>
                  <span style={styles.previewQid}>{q.id}</span>
                  <span style={styles.previewText}>{q.text}</span>
                  <span style={styles.previewTag}>{TYPE_LABEL[q.type]} · {SHOW_LABEL[q.show_to]}</span>
                </li>
              ))}
            </ol>
          )}
          {/* [F-9][QADM-VERSION-04] 되돌리기 버튼은 일부러 없다(불변 버전) — 대신 이 복사 경로로 되돌린다.
              막다른 길 금지: 옛 버전을 보기만 하고 못 쓰면 안 된다. */}
          <button
            type="button"
            onClick={() => onCopyToEditor(previewQ.data!.questions)}
            style={styles.previewCopy}
          >
            이 버전을 편집기로 복사
          </button>
        </section>
      )}
    </aside>
  )
}

// ── 저장 확인창 ────────────────────────────────────────

interface SaveConfirmDialogProps {
  currentNo: number
  nextNo: number
  busy: boolean
  onCancel(): void
  onConfirm(): void
}

function SaveConfirmDialog({ currentNo, nextNo, busy, onCancel, onConfirm }: SaveConfirmDialogProps) {
  return (
    <div style={dialogStyles.scrim} data-testid="dialog-scrim">
      <div role="dialog" aria-modal="true" aria-label="새 버전으로 저장" style={styles.dialog}>
        <h2 style={styles.dialogTitle}>새 버전으로 저장할까요?</h2>
        <p style={styles.dialogVersion}>v{currentNo} → v{nextNo}</p>
        <p style={styles.dialogBody}>과거 답변은 그대로 보존됩니다. 지금 저장하면 새 버전이 즉시 현재 버전이 됩니다.</p>
        <p style={styles.dialogBody}>작성 중인 환자는 다음에 다시 열 때 새 문항으로 이어집니다.</p>
        <div style={styles.dialogActions}>
          <button type="button" onClick={onCancel} style={styles.dialogCancel}>취소</button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy}
            style={{ ...styles.dialogConfirm, ...(busy ? styles.btnDisabled : null) }}
          >
            새 버전으로 저장
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 저장 안 한 채 이동 경고 ─────────────────────────────

function UnsavedGuardDialog({ onKeepEditing, onDiscard }: { onKeepEditing(): void; onDiscard(): void }) {
  return (
    <div style={dialogStyles.scrim} data-testid="dialog-scrim">
      <div role="dialog" aria-modal="true" aria-label="저장되지 않은 변경이 있습니다" style={styles.dialog}>
        <h2 style={styles.dialogTitle}>저장되지 않은 변경이 있습니다</h2>
        <p style={styles.dialogBody}>지금 다른 진료과로 옮기면 저장하지 않은 변경은 사라집니다.</p>
        <div style={styles.dialogActions}>
          <button type="button" onClick={onKeepEditing} style={styles.dialogCancel}>계속 편집</button>
          <button type="button" onClick={onDiscard} style={styles.dialogDiscard}>변경 버리고 이동</button>
        </div>
      </div>
    </div>
  )
}

// ── 스타일 — 딥틸 자체 콘솔. 각진·촘촘한 관리 패널(정본 토큰만). ──

const panel: CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-divider)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-card)',
}

const styles: Record<string, CSSProperties> = {
  page: { padding: 'var(--sp-5)', maxWidth: 1180, margin: '0 auto' },
  pageHead: { marginBottom: 'var(--sp-4)' },
  pageTitle: { margin: '0 0 var(--sp-1)', fontSize: 'var(--fs-title)', color: 'var(--color-ink)' },
  pageDesc: { margin: 0, fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)' },
  grid: { display: 'grid', gridTemplateColumns: '235px minmax(500px, 1fr) 286px', gap: 'var(--sp-4)', alignItems: 'start' },
  col: { minWidth: 0 },
  colLabel: {
    margin: '0 0 var(--sp-2)', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], letterSpacing: '.04em',
    textTransform: 'uppercase', color: 'var(--color-ink-muted)',
  },
  deptList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' },
  deptBtn: {
    ...panel, width: '100%', textAlign: 'left', padding: 'var(--sp-3) var(--sp-3)', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', gap: 'var(--sp-0-5)', borderRadius: 8,
  },
  deptBtnActive: {
    borderColor: 'var(--color-primary)', background: 'var(--color-primary-wash)',
  },
  deptName: { fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  deptMeta: { fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },

  placeholder: { ...panel, padding: 'var(--sp-12) var(--sp-6)', textAlign: 'center' },
  placeholderTitle: { margin: 0, fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)' },

  loadingWrap: { ...panel, padding: 'var(--sp-4)' },
  loadingText: { margin: '0 0 var(--sp-3)', fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)' },
  skeleton: { height: 64, borderRadius: 8, marginBottom: 'var(--sp-3)', background: 'var(--color-divider)', opacity: 0.55 },

  editor: { ...panel, padding: 'var(--sp-4)' },
  editorHead: { paddingBottom: 'var(--sp-3)', borderBottom: '1px solid var(--color-divider)', marginBottom: 'var(--sp-3)' },
  editorTitleRow: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' },
  editorTitle: { margin: 0, fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  currentBadge: {
    fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-primary)',
    background: 'var(--color-primary-wash)', borderRadius: 6, padding: 'var(--sp-0-5) var(--sp-2)',
  },
  dirtyBadge: {
    fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-warn)',
    border: '1px solid var(--color-warn)', borderRadius: 6, padding: '1px var(--sp-2)',
  },
  editorSub: { margin: 'var(--sp-2) 0 0', fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  editorActions: { marginTop: 'var(--sp-3)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-3)' },
  saveBtn: {
    height: 34, padding: '0 var(--sp-4)', borderRadius: 8, border: 'none',
    background: 'var(--color-primary)', color: '#fff', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
  btnDisabled: { background: 'var(--color-gray-past)', borderColor: 'var(--color-gray-past)', color: '#fff', cursor: 'not-allowed' },
  offline: {
    margin: 'var(--sp-3) 0 0', padding: 'var(--sp-2) var(--sp-3)', borderRadius: 8,
    borderLeft: '4px solid var(--color-warn)', background: 'var(--color-bg)',
    fontSize: 'var(--fs-caption)', color: 'var(--color-ink)',
  },
  offlineLine: { margin: 0 },

  flash: {
    margin: '0 0 var(--sp-3)', padding: 'var(--sp-3) var(--sp-3)', borderRadius: 8,
    borderLeft: '4px solid var(--color-primary)', background: 'var(--color-primary-wash)',
    fontSize: 'var(--fs-body)', color: 'var(--color-ink)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
  },
  alert: {
    margin: '0 0 var(--sp-3)', padding: 'var(--sp-3) var(--sp-3)', borderRadius: 8,
    borderLeft: '4px solid var(--color-danger)', background: 'var(--color-danger-bg)',
    fontSize: 'var(--fs-body)', color: 'var(--color-danger)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
  },
  conflict: {
    margin: '0 0 var(--sp-3)', padding: 'var(--sp-3) var(--sp-3)', borderRadius: 8,
    borderLeft: '4px solid var(--color-warn)', background: 'var(--color-bg)',
    display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', alignItems: 'flex-start',
  },
  conflictMsg: { margin: 0, fontSize: 'var(--fs-body)', color: 'var(--color-ink)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'] },
  conflictBtn: {
    height: 32, padding: '0 var(--sp-4)', borderRadius: 8, border: '1px solid var(--color-primary)',
    background: 'var(--color-surface)', color: 'var(--color-primary)', fontSize: 'var(--fs-body)',
    fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
  },

  hint: { margin: '0 0 var(--sp-2)', fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)', lineHeight: 1.5 },

  emptyForm: {
    marginTop: 'var(--sp-2)', padding: 'var(--sp-8) var(--sp-5)', textAlign: 'center',
    border: '1px dashed var(--color-divider)', borderRadius: 8,
  },
  emptyFormTitle: { margin: 0, fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  emptyFormHint: { margin: 'var(--sp-2) 0 var(--sp-4)', fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  addFirstBtn: {
    height: 34, padding: '0 var(--sp-4)', borderRadius: 8, border: '1px solid var(--color-primary)',
    background: 'var(--color-surface)', color: 'var(--color-primary)', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },

  rows: { listStyle: 'none', margin: '0 0 var(--sp-3)', padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' },
  row: { border: '1px solid var(--color-divider)', borderRadius: 8, padding: 'var(--sp-3)', background: 'var(--color-bg)' },
  rowHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-2)' },
  qid: {
    fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-primary)',
    background: 'var(--color-primary-wash)', padding: 'var(--sp-0-5) var(--sp-2)', borderRadius: 6,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', textTransform: 'uppercase',
  },
  rowMoveGroup: { display: 'flex', gap: 'var(--sp-2)' },
  moveBtn: {
    height: 28, padding: '0 var(--sp-3)', borderRadius: 6, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
  removeBtn: {
    height: 28, padding: '0 var(--sp-3)', borderRadius: 6, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink-muted)', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
  field: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', flex: 1 },
  fieldLabel: { fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], color: 'var(--color-ink-muted)' },
  textarea: {
    width: '100%', resize: 'vertical', padding: 'var(--sp-2) var(--sp-3)', borderRadius: 6,
    border: '1px solid var(--color-divider)', fontSize: 'var(--fs-body)', color: 'var(--color-ink)',
    fontFamily: 'inherit', boxSizing: 'border-box',
  },
  fieldRow: { display: 'flex', gap: 'var(--sp-3)', marginTop: 'var(--sp-2)', alignItems: 'flex-end', flexWrap: 'wrap' },
  select: {
    height: 32, padding: '0 var(--sp-2)', borderRadius: 6, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', fontSize: 'var(--fs-body)', color: 'var(--color-ink)',
  },
  checkField: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', height: 32 },

  countRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-2)' },
  countText: { fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' },
  addBtn: {
    height: 32, padding: '0 var(--sp-4)', borderRadius: 8, border: '1px solid var(--color-primary)',
    background: 'var(--color-surface)', color: 'var(--color-primary)', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
  maxNotice: {
    marginTop: 'var(--sp-3)', padding: 'var(--sp-2) var(--sp-3)', borderRadius: 8,
    borderLeft: '4px solid var(--color-warn)', background: 'var(--color-bg)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-2)',
  },
  maxNoticeMsg: { margin: 0, fontSize: 'var(--fs-caption)', color: 'var(--color-ink)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'] },
  reduceBtn: {
    height: 28, padding: '0 var(--sp-3)', borderRadius: 6, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },

  history: { ...panel, padding: 'var(--sp-4)' },
  historyEmpty: { margin: 0, fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  versionList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' },
  versionItem: { border: '1px solid var(--color-divider)', borderRadius: 8, padding: 'var(--sp-3)' },
  versionTop: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 'var(--sp-0-5)' },
  versionNo: { fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  versionActive: {
    fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-primary)',
    background: 'var(--color-primary-wash)', borderRadius: 5, padding: '1px var(--sp-2)',
  },
  versionMeta: { margin: 0, fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  viewBtn: {
    marginTop: 'var(--sp-2)', height: 28, padding: '0 var(--sp-3)', borderRadius: 6, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-primary)', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },

  preview: { ...panel, padding: 'var(--sp-4)', marginTop: 'var(--sp-3)' },
  previewHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-2)' },
  previewTitle: { margin: 0, fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  previewClose: {
    height: 26, padding: '0 var(--sp-3)', borderRadius: 6, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink-muted)', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
  previewEmpty: { margin: 0, fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  previewCopy: {
    marginTop: 'var(--sp-3)', width: '100%', height: 34, borderRadius: 8, border: 'none',
    background: 'var(--color-primary)', color: 'var(--color-primary-foreground)',
    fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
  previewList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' },
  previewItem: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-0-5)', paddingBottom: 'var(--sp-2)', borderBottom: '1px solid var(--color-divider)' },
  previewQid: { fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-primary)', fontFamily: 'ui-monospace, Menlo, monospace' },
  previewText: { fontSize: 'var(--fs-body)', color: 'var(--color-ink)' },
  previewTag: { fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },

  dialog: { ...dialogStyles.dialog },
  dialogTitle: { margin: 0, fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  dialogVersion: {
    margin: 'var(--sp-3) 0 0', fontSize: 'var(--fs-title)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-primary)',
    fontVariantNumeric: 'tabular-nums',
  },
  dialogBody: { margin: 'var(--sp-2) 0 0', fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)', lineHeight: 1.5 },
  dialogActions: { display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', marginTop: 'var(--sp-5)' },
  dialogCancel: {
    height: 34, padding: '0 var(--sp-4)', borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
  dialogConfirm: {
    height: 34, padding: '0 var(--sp-4)', borderRadius: 8, border: 'none',
    background: 'var(--color-primary)', color: '#fff', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
  dialogDiscard: {
    height: 34, padding: '0 var(--sp-4)', borderRadius: 8, border: '1px solid var(--color-warn)',
    background: 'var(--color-surface)', color: 'var(--color-warn)', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
}
