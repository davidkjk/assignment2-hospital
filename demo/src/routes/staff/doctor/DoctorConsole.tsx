import { useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  FileText,
  History,
  Stethoscope,
  UserRound,
} from '@/components/icons'
import { maskBirth } from '../mockData'
import { PageHead, Panel, StaffPage, StatusBadge, Tag, btnGhost, btnPrimary } from '../_ui'
import { doctorQueue, quickPhrases, type DoctorQueueStatus } from './mockData'

// 의사 콘솔 (/doctor/console) — DOCTOR-*.
// 최상위: data-testid="doctor-console". 오늘 대기 / 환자 맥락 / 과거기록·진료기록 작성 3단.

type RecordField = 'symptoms' | 'diagnosis' | 'treatment' | 'publicNote'
type RecordDraft = Record<RecordField, string>

const textareaClass =
  'w-full rounded-lg border border-input bg-card p-3 text-sm leading-6 outline-none focus:border-ring focus:ring-2 focus:ring-ring/40 disabled:bg-muted disabled:text-muted-foreground'

export function DoctorConsole() {
  const [selectedId, setSelectedId] = useState(doctorQueue[0].id)
  const [statuses, setStatuses] = useState<Record<string, DoctorQueueStatus>>(
    Object.fromEntries(doctorQueue.map((patient) => [patient.id, patient.status])),
  )
  const [draft, setDraft] = useState<RecordDraft>({ symptoms: '', diagnosis: '', treatment: '', publicNote: '' })
  const [focusedField, setFocusedField] = useState<RecordField | null>(null)
  const [noteInputOpen, setNoteInputOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [addedNotes, setAddedNotes] = useState<string[]>([])
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [completed, setCompleted] = useState(false)

  const selected = doctorQueue.find((patient) => patient.id === selectedId) ?? doctorQueue[0]
  const selectedStatus = statuses[selected.id]

  const choosePatient = (patientId: string) => {
    const patient = doctorQueue.find((item) => item.id === patientId)
    if (!patient) return
    setSelectedId(patientId)
    setCompleted(false)
    setDraft({ symptoms: '', diagnosis: '', treatment: '', publicNote: '' })
    setFocusedField(null)
    if (statuses[patientId] === '진료 대기') {
      setStatuses((current) => ({ ...current, [patientId]: '진료 중' }))
    }
  }

  const updateDraft = (field: RecordField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
    setSavedAt(null)
  }

  const insertPhrase = (text: string) => {
    if (!focusedField) return
    setDraft((current) => ({
      ...current,
      [focusedField]: current[focusedField] ? `${current[focusedField]}\n${text}` : text,
    }))
    setSavedAt(null)
  }

  const statusLabel = completed ? '진료 완료' : selectedStatus

  return (
    <StaffPage testid="doctor-console" max="max-w-[1700px]">
      <PageHead
        title="진료 화면"
        sub="이정훈 의사 · 내과 · 2026년 8월 22일 (토)"
        action={<button className={btnGhost}>열 너비 기본값으로</button>}
      />

      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[1160px] grid-cols-[240px_330px_minmax(540px,1fr)] gap-3">
          <Panel
            title="오늘 대기 목록"
            action={<Tag>{doctorQueue.length}명</Tag>}
            className="h-fit"
          >
            <label className="mb-3 flex items-center gap-2 rounded-lg border border-input bg-card px-2.5 py-2 text-xs">
              <CalendarDays className="h-4 w-4 text-primary" />
              <input type="date" value="2026-08-22" max="2026-08-22" readOnly className="min-w-0 flex-1 bg-transparent outline-none" />
            </label>
            <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border">
              {doctorQueue.map((patient) => {
                const currentStatus = statuses[patient.id]
                const active = patient.id === selected.id
                return (
                  <button
                    key={patient.id}
                    onClick={() => choosePatient(patient.id)}
                    className={`block w-full p-3 text-left transition-colors ${active ? 'bg-primary/10' : 'hover:bg-muted'}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold ${active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        {patient.order}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{patient.name}</span>
                          <span className="text-xs tabular-nums text-muted-foreground">{patient.waitMinutes}분</span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{maskBirth(patient.birth)} · {patient.department}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={currentStatus} />
                          {patient.attention && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                              <AlertTriangle className="h-3 w-3" />주의 표시
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </Panel>

          <div className="space-y-3">
            <Panel>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <UserRound className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold">{selected.name}</h3>
                    <StatusBadge status={statusLabel} />
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{selected.birth} · {selected.sex}</p>
                  <p className="mt-2 text-xs text-muted-foreground">8월 22일 {selected.time} · {selected.department} / {selected.doctor}</p>
                </div>
              </div>
              {selectedStatus === '진료 중' && !completed && (
                <button
                  onClick={() => setStatuses((current) => ({ ...current, [selected.id]: '도착' }))}
                  className="mt-3 w-full rounded-lg border border-border bg-muted px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  도착 상태로 되돌리기
                </button>
              )}
            </Panel>

            <Panel title="오늘 예약 이유">
              <p className="text-sm leading-6">{selected.reason || '예약 이유를 작성하지 않았습니다'}</p>
              {selected.attention && (
                <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-muted p-2 text-xs font-medium">
                  <AlertTriangle className="h-4 w-4 text-primary" />{selected.attention}
                </p>
              )}
            </Panel>

            <Panel title="사전문진 요약" action={selected.questionnaire.length > 0 ? <span className="text-xs text-muted-foreground">오늘 08:41 제출</span> : undefined}>
              {selected.questionnaire.length > 0 ? (
                <dl className="divide-y divide-border/60">
                  {selected.questionnaire.map((item) => (
                    <div key={item.question} className="py-2 first:pt-0 last:pb-0">
                      <dt className="text-xs font-medium text-muted-foreground">{item.question}</dt>
                      <dd className="mt-1 text-sm leading-5">{item.answer}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">제출된 사전문진이 없습니다</p>
              )}
            </Panel>

            <Panel
              title="내부 메모"
              action={<button className="text-xs font-medium text-primary hover:underline" onClick={() => setNoteInputOpen(true)}>내부 메모 추가</button>}
            >
              <div className="space-y-2">
                {selected.notes.map((note) => (
                  <div key={`${note.at}-${note.author}`} className="rounded-lg bg-muted p-2.5">
                    <p className="text-sm leading-5">{note.content}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{note.author} · {note.at}</p>
                  </div>
                ))}
                {addedNotes.map((note, index) => (
                  <div key={`${note}-${index}`} className="rounded-lg bg-muted p-2.5">
                    <p className="text-sm leading-5">{note}</p>
                    <p className="mt-1 text-xs text-muted-foreground">이정훈 · 방금</p>
                  </div>
                ))}
                {selected.notes.length === 0 && addedNotes.length === 0 && !noteInputOpen && (
                  <p className="py-3 text-center text-sm text-muted-foreground">내부 메모가 없습니다</p>
                )}
                {noteInputOpen && (
                  <div>
                    <textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} rows={3} className={textareaClass} placeholder="직원만 볼 수 있는 메모입니다" />
                    <div className="mt-2 flex justify-end gap-2">
                      <button className={btnGhost} onClick={() => { setNoteInputOpen(false); setNoteText('') }}>취소</button>
                      <button
                        disabled={!noteText.trim()}
                        className={btnPrimary}
                        onClick={() => { setAddedNotes((current) => [...current, noteText.trim()]); setNoteText(''); setNoteInputOpen(false) }}
                      >메모 저장</button>
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          </div>

          <div className="space-y-3">
            <Panel title="완료된 과거 진료기록" action={<History className="h-4 w-4 text-muted-foreground" />}>
              {selected.histories.length > 0 ? (
                <div className="divide-y divide-border/60">
                  {selected.histories.map((history) => (
                    <div key={`${history.date}-${history.department}`} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-semibold tabular-nums">{history.date}</span>
                          <StatusBadge status="진료 완료" />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{history.department} · {history.doctor}</p>
                        <p className="mt-1 text-sm">{history.summary}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">완료된 과거 진료기록이 없습니다</p>
              )}
            </Panel>

            <Panel
              title={<span className="inline-flex items-center gap-2"><Stethoscope className="h-4 w-4 text-primary" />진료기록 작성</span>}
              action={savedAt ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3 w-3" />저장됨 · {savedAt}</span> : <span className="text-xs text-muted-foreground">자동 임시저장</span>}
            >
              <div className="mb-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">자주 쓰는 진료문구</span>
                  <button className="text-xs font-medium text-primary hover:underline">관리</button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {quickPhrases.map((phrase) => (
                    <button
                      key={phrase.label}
                      disabled={!focusedField || completed}
                      title={phrase.text}
                      onClick={() => insertPhrase(phrase.text)}
                      className="rounded-md border border-border bg-card px-2 py-1 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {phrase.label}
                    </button>
                  ))}
                </div>
                {!focusedField && !completed && <p className="mt-1.5 text-xs text-muted-foreground">문구를 넣을 칸을 먼저 선택하세요.</p>}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {([
                  ['symptoms', '증상', '환자가 호소하는 증상과 진찰 소견'],
                  ['diagnosis', '진단', '진단명과 판단 근거'],
                  ['treatment', '처치', '처방·검사·처치 내용'],
                ] as const).map(([field, label, placeholder]) => (
                  <label key={field} className="block">
                    <span className="mb-1.5 block text-sm font-medium">{label}</span>
                    <textarea
                      value={draft[field]}
                      onFocus={() => setFocusedField(field)}
                      onChange={(event) => updateDraft(field, event.target.value)}
                      disabled={completed}
                      rows={5}
                      placeholder={placeholder}
                      className={textareaClass}
                    />
                  </label>
                ))}
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">환자 공개용 안내문</span>
                  <textarea
                    value={draft.publicNote}
                    onFocus={() => setFocusedField('publicNote')}
                    onChange={(event) => updateDraft('publicNote', event.target.value)}
                    disabled={completed}
                    rows={5}
                    placeholder="환자가 앱의 방문 이력에서 볼 안내"
                    className={textareaClass}
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">진료 완료 후 환자 앱에 공개됩니다. 내부 진료기록 전체는 공개되지 않습니다.</span>
                </label>
              </div>

              {completed ? (
                <div className="mt-4 flex items-center justify-between rounded-lg bg-primary/10 px-4 py-3">
                  <span className="font-semibold">진료 완료 · 오늘 10:14</span>
                  <button className="text-xs font-medium text-primary hover:underline">수정 사유를 입력해 수정</button>
                </div>
              ) : (
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
                  <button className={btnGhost} onClick={() => setSavedAt('10:11')}>임시저장</button>
                  <button className={btnPrimary} onClick={() => setConfirmComplete(true)}>진료 완료</button>
                </div>
              )}
            </Panel>
          </div>
        </div>
      </div>

      {confirmComplete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4" role="dialog" aria-modal="true">
          <Panel className="w-full max-w-md" title="진료를 완료할까요?">
            <p className="text-sm leading-6 text-muted-foreground">완료 후에는 사유 입력 없이 수정할 수 없습니다. 환자 공개용 안내문도 함께 공개됩니다.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button className={btnGhost} onClick={() => setConfirmComplete(false)}>돌로</button>
              <button
                className={btnPrimary}
                onClick={() => {
                  setCompleted(true)
                  setStatuses((current) => ({ ...current, [selected.id]: '진료 완료' }))
                  setConfirmComplete(false)
                }}
              >진료 완료</button>
            </div>
          </Panel>
        </div>
      )}
    </StaffPage>
  )
}
