import { useEffect, useState } from 'react'
import {
  Stethoscope,
  ClipboardList,
  FileText,
  AlertTriangle,
  Eye,
  Pencil,
  Check,
} from '@/components/icons'
import { StatusBadge, btnPrimary, btnGhost } from '../_ui'
import { maskBirth } from '../mockData'
import {
  queue as initialQueue,
  quickPhrases,
  loginDoctor,
  type QueuePatient,
  type VisitStatus,
} from './mockData'

// 의사 콘솔 (/staff/doctor/console) — DOCTOR-*.
// 3단: 왼쪽 오늘 대기 / 가운데 환자 맥락 / 오른쪽 과거 기록 + 진료기록 작성.
// ⭐ 환자 공개용 안내문과 내부 진료기록(증상·진단·처치)을 시각적으로 가른다(DOCTOR-RECORD-02).
// 진료대기 환자를 열면 자동으로 '진료 중'(DOCTOR-START-01, 누를 버튼 없음).
// data-testid="doctor-console".

type Fields = { symptom: string; diagnosis: string; treatment: string; guide: string }
const EMPTY: Fields = { symptom: '', diagnosis: '', treatment: '', guide: '' }

const nowLabel = () => new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

export function DoctorConsole() {
  const [queue, setQueue] = useState<QueuePatient[]>(initialQueue)
  // 로그인 직후엔 아무도 안 열려 있다 — 의사가 대기 환자를 눌러야 그때 진료중으로 전이(DOCTOR-START-01)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [fields, setFields] = useState<Fields>(EMPTY)
  const [focused, setFocused] = useState<keyof Fields>('diagnosis')
  const [confirmDone, setConfirmDone] = useState(false)
  const [completed, setCompleted] = useState(false)
  // 완료 후 수정 (DOCTOR-RECORD-08) — 사유 필수
  const [revising, setRevising] = useState(false)
  const [reviseReason, setReviseReason] = useState('')
  // 임시저장·자동저장 (DOCTOR-RECORD-04)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  // 내부 메모 추가 (DOCTOR-NOTE-02)
  const [addingNote, setAddingNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [extraNotes, setExtraNotes] = useState<Record<string, { text: string; staff: string; at: string }[]>>({})

  const selected = queue.find((p) => p.id === selectedId) ?? null

  // 입력을 고치면 자동으로 임시저장(타이핑이 멎으면 저장) — DOCTOR-RECORD-04
  useEffect(() => {
    if (!dirty) return
    setSaving(true)
    const t = setTimeout(() => { setSavedAt(nowLabel()); setDirty(false); setSaving(false) }, 1500)
    return () => clearTimeout(t)
  }, [fields, dirty])

  const patch = (p: Partial<Fields>) => { setFields((prev) => ({ ...prev, ...p })); setDirty(true) }
  const saveDraft = () => { setSavedAt(nowLabel()); setDirty(false); setSaving(false) }

  const openPatient = (p: QueuePatient) => {
    setSelectedId(p.id)
    setFields(EMPTY)
    setCompleted(false)
    setSavedAt(null)
    setDirty(false)
    setRevising(false)
    setReviseReason('')
    setAddingNote(false)
    setNoteText('')
    // 진료대기 → 열면 자동으로 진료 중 (DOCTOR-START-01)
    if (p.status === '진료 대기') {
      setQueue((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: '진료 중' } : x)))
    }
  }

  const addNote = () => {
    const text = noteText.trim()
    if (!text || !selected) return
    setExtraNotes((prev) => ({ ...prev, [selected.id]: [{ text, staff: loginDoctor.name, at: '방금' }, ...(prev[selected.id] ?? [])] }))
    setNoteText('')
    setAddingNote(false)
  }
  const notes = selected ? [...(extraNotes[selected.id] ?? []), ...(selected.notes ?? [])] : []

  const setStatus = (status: VisitStatus) =>
    setQueue((prev) => prev.map((x) => (x.id === selectedId ? { ...x, status } : x)))

  return (
    <div data-testid="doctor-console" className="flex h-[calc(100vh-3.5rem)] gap-0">
      {/* ── 왼쪽: 오늘 대기 목록 ── */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-border/70 bg-card">
        <div className="border-b border-border/70 px-4 py-3">
          <h2 className="text-sm font-bold">오늘 진료 대기</h2>
          <p className="text-xs text-muted-foreground">{loginDoctor.department} · {loginDoctor.name} 선생님</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {queue.map((p) => (
            <button
              key={p.id}
              onClick={() => openPatient(p)}
              className={`mb-1 w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                p.id === selectedId ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <span className="tabular-nums text-muted-foreground">{p.position}</span>
                  {p.name}
                </span>
                <StatusBadge status={p.status} />
              </div>
              <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="tabular-nums">{maskBirth(p.birth)} · {p.gender}</span>
                <span className="tabular-nums">대기 {p.waitMin}분</span>
              </div>
              {p.urgent && (
                <div className="mt-1 flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                  <AlertTriangle className="h-3 w-3" /> 주의 · {p.urgent}
                </div>
              )}
            </button>
          ))}
        </div>
      </aside>

      {!selected ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-muted/10 text-center">
          <Stethoscope className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">왼쪽에서 진료할 환자를 고르세요</p>
          <p className="text-xs text-muted-foreground/70">환자를 누르면 진료가 시작됩니다(진료 중).</p>
        </div>
      ) : (
      <>
      {/* ── 가운데: 현재 환자 맥락 ── */}
      <section className="w-80 shrink-0 overflow-y-auto border-r border-border/70 bg-muted/20 p-4">
        {/* 기본정보 고정 (DOCTOR-CONTEXT-01) */}
        <div className="rounded-xl border border-border/70 bg-card p-3 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-bold">{selected.name}</h2>
            <span className="text-xs tabular-nums text-muted-foreground">{maskBirth(selected.birth)} · {selected.gender}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="tabular-nums">{selected.appt.time}</span>
            <span>·</span>
            <span>{selected.appt.department}</span>
            <StatusBadge status={selected.status} />
          </div>
        </div>

        {/* 오늘 예약 이유 (DOCTOR-CONTEXT-03) */}
        <Block icon={<ClipboardList className="h-4 w-4" />} title="오늘 예약 이유">
          {selected.appt.reason ? (
            <p className="text-sm">{selected.appt.reason}</p>
          ) : (
            <p className="text-sm text-muted-foreground">예약 이유를 작성하지 않았습니다.</p>
          )}
        </Block>

        {/* 사전문진 (DOCTOR-QNR-*) */}
        <Block icon={<FileText className="h-4 w-4" />} title="사전문진">
          {selected.questionnaire && selected.questionnaire.length > 0 ? (
            <dl className="space-y-2">
              {selected.questionnaire.map((qa, i) => (
                <div key={i}>
                  <dt className="text-xs text-muted-foreground">{qa.q}</dt>
                  <dd className={`text-sm ${qa.a ? '' : 'text-amber-700'}`}>
                    {qa.a || '답변 없음'}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">제출된 사전문진이 없습니다.</p>
          )}
        </Block>

        {/* 내부 메모 (DOCTOR-NOTE-*) */}
        <Block title="내부 메모">
          {notes.length > 0 ? (
            <ul className="space-y-2">
              {notes.map((n, i) => (
                <li key={i} className="rounded-lg bg-muted/50 p-2">
                  <p className="text-sm">{n.text}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{n.staff} · {n.at}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">등록된 내부 메모가 없습니다.</p>
          )}
          {addingNote ? (
            <div className="mt-2">
              <textarea
                autoFocus
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={2}
                placeholder="이 환자에 대한 내부 메모 (직원끼리만 봅니다)"
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
              />
              <div className="mt-1.5 flex justify-end gap-2">
                <button className={`${btnGhost} px-2.5 py-1`} onClick={() => { setAddingNote(false); setNoteText('') }}>취소</button>
                <button className={`${btnPrimary} px-2.5 py-1`} disabled={!noteText.trim()} onClick={addNote}>저장</button>
              </div>
            </div>
          ) : (
            <button className={`${btnGhost} mt-2 w-full justify-center py-1.5`} onClick={() => setAddingNote(true)}>
              <Pencil className="h-3.5 w-3.5" /> 내부 메모 추가
            </button>
          )}
        </Block>
      </section>

      {/* ── 오른쪽: 진료기록 작성(위) + 과거 기록(아래) ──
          의사 주 업무는 지금 진료를 '쓰는' 것이라 작성 칸을 위에 두고, 과거 기록은 참고용으로 그 아래에 둔다
          (사용자 확정 2026-08-23). ⚠️ 정본 DOCTOR-HISTORY-01 「오른쪽 위」와 어긋남 → 정본 반영 시 함께 갱신·역참조. */}
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-card">
        {/* 진료기록 작성 (DOCTOR-RECORD-*) — 위 */}
        <div className="border-b border-border/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Stethoscope className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">진료기록 작성</h3>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {saving ? '저장 중…' : dirty ? '저장 안 됨' : savedAt ? `저장됨 · ${savedAt}` : ''}
            </span>
          </div>

          {completed && !revising ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
              <Check className="mx-auto h-6 w-6 text-emerald-600" />
              <p className="mt-1 text-sm font-medium text-emerald-800">진료 완료 처리했습니다.</p>
              <p className="mt-0.5 text-xs text-emerald-700">완료한 뒤에 수정하려면 사유를 남겨야 합니다.</p>
              <button className={`${btnGhost} mx-auto mt-3`} onClick={() => { setRevising(true); setReviseReason('') }}>
                <Pencil className="h-3.5 w-3.5" /> 완료 기록 수정
              </button>
            </div>
          ) : (
            <>
              {/* 완료 후 수정 = 사유 필수 (DOCTOR-RECORD-08) */}
              {revising && (
                <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
                  <label className="mb-1 block text-xs font-semibold text-amber-900">수정 사유 (필수)</label>
                  <input
                    value={reviseReason}
                    onChange={(e) => setReviseReason(e.target.value)}
                    placeholder="완료된 기록을 왜 고치는지 적습니다 (수정이력에 남습니다)"
                    className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
                  />
                </div>
              )}
              {/* 진료문구 칩 (DOCTOR-PHRASE-*) */}
              <QuickPhrases fields={fields} patch={patch} focused={focused} />

              {/* 내부용 3칸 */}
              <RecordField label="증상" value={fields.symptom} onChange={(v) => patch({ symptom: v })} onFocus={() => setFocused('symptom')} rows={2} />
              <RecordField label="진단" value={fields.diagnosis} onChange={(v) => patch({ diagnosis: v })} onFocus={() => setFocused('diagnosis')} rows={2} />
              <RecordField label="처치" value={fields.treatment} onChange={(v) => patch({ treatment: v })} onFocus={() => setFocused('treatment')} rows={2} />

              {/* 환자 공개용 안내문 — 시각적으로 확실히 가른다 (DOCTOR-RECORD-02) */}
              <div className="mt-4 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-3">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold text-primary">환자에게 보임</span>
                  <span className="text-xs font-medium">환자 공개용 안내문</span>
                </div>
                <p className="mb-1.5 text-[11px] text-muted-foreground">
                  완료하면 환자 앱의 방문 이력에 이 글만 보입니다. 위 증상·진단·처치는 내부 기록으로 남습니다.
                </p>
                <textarea
                  value={fields.guide}
                  onChange={(e) => patch({ guide: e.target.value })}
                  onFocus={() => setFocused('guide')}
                  rows={3}
                  placeholder="환자가 읽을 안내를 쉬운 말로 적습니다"
                  className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
                />
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                {revising ? (
                  <>
                    <button className={btnGhost} onClick={() => setRevising(false)}>취소</button>
                    <button className={`${btnPrimary} disabled:opacity-50`} disabled={!reviseReason.trim()} onClick={() => setRevising(false)}>수정 저장</button>
                  </>
                ) : (
                  <>
                    <button className={btnGhost} onClick={saveDraft}>임시저장</button>
                    <button className={btnPrimary} onClick={() => setConfirmDone(true)}>진료 완료</button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* 과거 진료기록 (읽기전용, 참고용이라 작성 아래, DOCTOR-HISTORY-*) */}
        <div className="p-4">
          <div className="mb-2 flex items-center gap-1.5">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">과거 진료기록</h3>
            <span className="text-xs text-muted-foreground">읽기 전용</span>
          </div>
          {selected.history && selected.history.length > 0 ? (
            <ul className="space-y-1.5">
              {selected.history.map((h, i) => (
                <li key={i} className="rounded-lg border border-border/60 px-3 py-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="tabular-nums">{h.date} · {h.department} / {h.doctor}</span>
                    <StatusBadge status="진료 완료" />
                  </div>
                  <p className="mt-1 text-sm">{h.summary}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">완료된 과거 진료기록이 없습니다.</p>
          )}
        </div>
      </section>
      </>
      )}

      {confirmDone && selected && (
        <DoneConfirm
          name={selected.name}
          onClose={() => setConfirmDone(false)}
          onDone={() => {
            setStatus('진료 완료')
            setCompleted(true)
            setConfirmDone(false)
          }}
        />
      )}
    </div>
  )
}

function Block({ icon, title, children }: { icon?: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-xl border border-border/70 bg-card p-3 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  )
}

function RecordField({ label, value, onChange, onFocus, rows }: { label: string; value: string; onChange: (v: string) => void; onFocus: () => void; rows: number }) {
  return (
    <div className="mt-3">
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        rows={rows}
        className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
      />
    </div>
  )
}

const FIELD_LABEL: Record<keyof Fields, string> = { symptom: '증상', diagnosis: '진단', treatment: '처치', guide: '안내문' }

function QuickPhrases({ fields, patch, focused }: { fields: Fields; patch: (p: Partial<Fields>) => void; focused: keyof Fields }) {
  // 지금 커서가 있는 칸에 삽입 (DOCTOR-PHRASE-02)
  const insert = (text: string) => {
    const cur = fields[focused]
    patch({ [focused]: cur ? `${cur} ${text}` : text })
  }
  return (
    <div className="mb-3">
      <p className="mb-1.5 text-[11px] text-muted-foreground">자주 쓰는 소견 — 「{FIELD_LABEL[focused]}」 칸에 넣습니다</p>
      <div className="flex flex-wrap gap-1.5">
        {quickPhrases.map((p) => (
          <button
            key={p.label}
            title={p.text}
            onClick={() => insert(p.text)}
            className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium hover:border-primary/60 hover:bg-primary/5"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function DoneConfirm({ name, onClose, onDone }: { name: string; onClose: () => void; onDone: () => void }) {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
        <h3 className="text-base font-bold">진료를 완료할까요?</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{name}</span> 님의 진료를 완료합니다. 완료한 뒤에 수정하려면 사유를 입력해야 합니다.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button className={btnGhost} onClick={onClose}>돌아가기</button>
          <button className={btnPrimary} onClick={onDone}>진료 완료</button>
        </div>
      </div>
    </div>
  )
}
