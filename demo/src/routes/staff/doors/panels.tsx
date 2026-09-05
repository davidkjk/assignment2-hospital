import { useEffect, useState, type ReactNode } from 'react'
import { CalendarPlus, Check, ChevronLeft, ChevronRight, QrCode, UserPlus, X } from '@/components/icons'
import { maskBirth, maskPhone } from '../mockData'
import { CheckinForm } from '../checkin/CheckinForm'
import { useDoors } from './DoorContext'
import { doctorWaitMap, doorDoctors, fmtDate, findDuplicate, type FieldId } from './doorData'

// ── 공용 드로어 조각 ──────────────────────────────────────────────

/** 패널의 한 칸 — 누르면 그 칸을 채우는 도구가 왼쪽에 뜬다(PANEL-WORK-01).
 *  채우는 중인 칸엔 테두리가 생긴다(PANEL-WORK-03). */
function FieldRow({
  label,
  field,
  active,
  filled,
  onActivate,
  children,
}: {
  label: string
  field?: FieldId
  active: boolean
  filled?: boolean
  onActivate?: () => void
  children: ReactNode
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {label}
        {active && field && <span className="text-primary">· 고르는 중</span>}
      </div>
      <button
        onClick={onActivate}
        className={[
          'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
          active
            ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
            : filled
              ? 'border-border bg-card hover:bg-muted/50'
              : 'border-dashed border-border bg-card text-muted-foreground hover:bg-muted/50',
        ].join(' ')}
      >
        {children}
      </button>
    </div>
  )
}

/** 선택된 값 카드(환자·의사) + [바꾸기] (PANEL-FIND-04 — 되돌리기) */
function PickedValue({ title, sub, onChange }: { title: string; sub: string; onChange: () => void }) {
  return (
    <span className="flex w-full items-center justify-between gap-2">
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{sub}</span>
      </span>
      <span
        onClick={(e) => {
          e.stopPropagation()
          onChange()
        }}
        className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
      >
        바꾸기
      </span>
    </span>
  )
}

/** 패널 안에서 펼쳐지는 의사 목록 — 별도 화면을 만들지 않는다(PANEL-WORK-02).
 *  대기 인원을 함께 적어 "덜 기다리는 의사"로 고른다(QUEUE-WALK-08b). */
function DoctorInlineList({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="mt-1.5 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border/70 bg-muted/30 p-1.5">
      {doorDoctors.map((d) => {
        const wait = doctorWaitMap[d.id] ?? 0
        return (
          <button
            key={d.id}
            onClick={() => onPick(d.id)}
            className="flex w-full items-center gap-2 rounded-md bg-card px-2.5 py-2 text-left text-sm hover:bg-primary/5"
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.fill, border: `1px solid ${d.ink}` }} />
            <span className="font-medium">{d.name}</span>
            <span className="text-xs text-muted-foreground">{d.department}</span>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {wait > 0 ? `대기 ${wait}명` : '대기 없음'}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** 저장 직전 가운데 팝업으로 한 번 더 확인 (QUEUE-SAME-01 · PANEL-USE-02) */
function ConfirmPopup({
  title,
  lines,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string
  lines: { k: string; v: string }[]
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-[var(--elevation-card)]">
        <h2 className="text-lg font-bold">{title}</h2>
        <dl className="mt-4 space-y-2 rounded-xl bg-muted/50 p-4 text-sm">
          {lines.map((l) => (
            <div key={l.k} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{l.k}</dt>
              <dd className="font-medium">{l.v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">
            다시 보기
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 세 문의 패널 본문 ─────────────────────────────────────────────

/** 예약 문 — 환자·의사·날짜·시각·사유 (CAL-BOOK-01) */
function ReserveBody() {
  const { draft, activeField, setField, patch, pickDoctor, finish } = useDoors()
  const [confirm, setConfirm] = useState(false)
  const ready = draft.patient && draft.doctor && draft.date && draft.time
  return (
    <div className="space-y-4">
      <FieldRow label="환자" field="patient" active={activeField === 'patient'} filled={!!draft.patient} onActivate={() => setField('patient')}>
        {draft.patient ? (
          <PickedValue title={draft.patient.name} sub={`${maskBirth(draft.patient.birth)} · ${maskPhone(draft.patient.tel)}`} onChange={() => setField('patient')} />
        ) : (
          '환자를 찾아 고르세요'
        )}
      </FieldRow>

      <div>
        <FieldRow label="담당 의사" field="doctor" active={activeField === 'doctor'} filled={!!draft.doctor} onActivate={() => setField('doctor')}>
          {draft.doctor ? (
            <PickedValue title={`${draft.doctor.name} 선생님`} sub={draft.doctor.department} onChange={() => setField('doctor')} />
          ) : (
            '의사를 고르세요'
          )}
        </FieldRow>
        {activeField === 'doctor' && <DoctorInlineList onPick={(id) => pickDoctor(doorDoctors.find((d) => d.id === id)!)} />}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="날짜" field="date" active={activeField === 'date'} filled={!!draft.date} onActivate={() => setField('date')}>
          {draft.date ? <span className="font-medium text-foreground">{fmtDate(draft.date)}</span> : '날짜'}
        </FieldRow>
        <FieldRow label="시각" field="time" active={activeField === 'time'} filled={!!draft.time} onActivate={() => (draft.doctor ? setField('time') : setField('doctor'))}>
          {draft.time ? <span className="font-medium tabular-nums text-foreground">{draft.time}</span> : '시각'}
        </FieldRow>
      </div>

      <div>
        <div className="mb-1 text-xs font-medium text-muted-foreground">방문 사유</div>
        <textarea
          value={draft.reason ?? ''}
          onChange={(e) => patch({ reason: e.target.value })}
          rows={2}
          placeholder="예) 고혈압 정기 진료"
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
        />
      </div>

      <button
        disabled={!ready}
        onClick={() => setConfirm(true)}
        className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
      >
        예약하기
      </button>
      {!ready && <p className="-mt-1 text-center text-xs text-muted-foreground">환자·의사·날짜·시각을 모두 고르면 예약할 수 있습니다</p>}

      {confirm && draft.patient && draft.doctor && (
        <ConfirmPopup
          title="이 내용으로 예약할까요?"
          lines={[
            { k: '환자', v: draft.patient.name },
            { k: '의사', v: `${draft.doctor.name} · ${draft.doctor.department}` },
            { k: '일시', v: `${fmtDate(draft.date!)} ${draft.time}` },
            { k: '사유', v: draft.reason || '—' },
          ]}
          confirmLabel="예약 확정"
          onCancel={() => setConfirm(false)}
          onConfirm={() => finish(`${draft.patient!.name} 님 예약을 ${draft.time}에 잡았습니다`)}
        />
      )}
    </div>
  )
}

/** 생년월일 입력 자동 서식 — 숫자만 8자리를 치면 YYYY-MM-DD로 (직원이 하이픈을 안 쳐도 됨) */
function fmtBirthInput(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8)
  return [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)].filter(Boolean).join('-')
}

/** 등록 문 — 새 환자를 병원에 등록한다. 검색은 강요하지 않는다(직원 재량 = 사이드바 '환자 검색').
 *  겹치면 소프트 확인만(막지 않음). 등록·확인 뒤에는 막다른 길 없이 예약/접수로 이음(F-4). */
function RegisterBody() {
  const { draft, patch, pickPatient, switchDoor, close } = useDoors()
  const [form, setForm] = useState({ name: '', sex: '', birth: '', tel: '' })
  const [confirm, setConfirm] = useState(false)
  const dup = findDuplicate(form.tel, form.birth)
  const birthOk = form.birth.replace(/\D/g, '').length === 8
  const newReady = !!form.name && !!form.sex && birthOk && form.tel.replace(/\D/g, '').length >= 9

  // 등록/확인한 환자 → 예약·접수로 이어간다
  if (draft.patient) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border/70 bg-muted/40 p-4">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-medium">{draft.isNew ? '새 환자로 등록했습니다' : '기존 환자를 찾았습니다'}</span>
          </div>
          <div className="mt-2 text-base font-semibold">{draft.patient.name}</div>
          <div className="text-sm text-muted-foreground">{maskBirth(draft.patient.birth)} · {maskPhone(draft.patient.tel)}</div>
        </div>
        <p className="text-sm text-muted-foreground">이 환자로 이어서 무엇을 할까요?</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => switchDoor('reserve')} className="rounded-lg border border-border bg-card py-2.5 text-sm font-medium hover:bg-muted">
            <CalendarPlus className="mr-1 inline h-4 w-4 text-primary" />예약 잡기
          </button>
          <button onClick={() => switchDoor('checkin')} className="rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <QrCode className="mr-1 inline h-4 w-4" />바로 접수
          </button>
        </div>
        <button onClick={close} className="w-full text-center text-xs font-medium text-muted-foreground hover:text-foreground">
          지금은 닫기
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">이름</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">성별</label>
          <div className="flex gap-1.5">
            {['남', '여'].map((s) => (
              <button key={s} onClick={() => setForm({ ...form, sex: s })} className={`h-10 flex-1 rounded-lg border text-sm ${form.sex === s ? 'border-primary bg-primary/5 font-medium text-primary' : 'border-input bg-card hover:bg-muted/50'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">생년월일</label>
          <input
            value={form.birth}
            onChange={(e) => setForm({ ...form, birth: fmtBirthInput(e.target.value) })}
            inputMode="numeric"
            placeholder="예) 19551203"
            className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm tabular-nums outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
          />
          <p className="mt-1 text-[0.7rem] text-muted-foreground">숫자 8자리만 치면 됩니다</p>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">전화번호</label>
        <input value={form.tel} onChange={(e) => setForm({ ...form, tel: e.target.value })} inputMode="numeric" placeholder="010-0000-0000" className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm tabular-nums outline-none focus:border-ring focus:ring-2 focus:ring-ring/40" />
      </div>

      {/* 소프트 중복 확인 — 막지 않는다(F-4) */}
      {dup && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span>
            혹시 <b>{dup.name}</b>({maskBirth(dup.birth)}) 님 아니세요? 전화번호가 같습니다.
            <button onClick={() => pickPatient(dup)} className="ml-1 font-semibold text-amber-900 underline">기존 기록 보기</button>
          </span>
        </div>
      )}

      <button
        disabled={!newReady}
        onClick={() => setConfirm(true)}
        className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
      >
        새 환자 등록
      </button>
      <p className="-mt-1 text-center text-xs text-muted-foreground">이미 오신 분인지 확인하려면 사이드바 <b className="text-foreground">환자 검색</b>을 쓰세요</p>

      {confirm && (
        <ConfirmPopup
          title="이 환자를 등록할까요?"
          lines={[
            { k: '이름', v: form.name },
            { k: '성별', v: form.sex },
            { k: '생년월일', v: form.birth },
            { k: '전화', v: form.tel },
          ]}
          confirmLabel="등록"
          onCancel={() => setConfirm(false)}
          onConfirm={() =>
            patch({
              patient: { id: `new-${Date.now()}`, name: form.name, birth: form.birth, tel: form.tel },
              isNew: true,
            })
          }
        />
      )}
    </div>
  )
}

/** 접수 문 — 예약 확인(QR·번호) / 예약 없이 오신 분(당일 방문) (F-4) */
function CheckinBody() {
  const { draft, activeField, setField, patch, pickDoctor, finish, close } = useDoors()
  const mode = draft.checkinMode ?? 'reserved'
  const [confirm, setConfirm] = useState(false)
  const walkReady = draft.patient && draft.doctor
  return (
    <div className="space-y-4">
      {/* 두 갈래 — 예약이 있으면 QR·번호, 없으면 당일 방문 */}
      <div className="inline-flex w-full rounded-lg border border-border bg-muted p-0.5 text-sm">
        {([
          ['reserved', '예약 확인'],
          ['walkin', '예약 없이 오신 분'],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => patch({ checkinMode: k })}
            className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${mode === k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'reserved' ? (
        <CheckinForm onClose={close} />
      ) : (
        <div className="space-y-4">
          <FieldRow label="환자" field="patient" active={activeField === 'patient'} filled={!!draft.patient} onActivate={() => setField('patient')}>
            {draft.patient ? (
              <PickedValue title={draft.patient.name} sub={`${maskBirth(draft.patient.birth)} · ${maskPhone(draft.patient.tel)}`} onChange={() => setField('patient')} />
            ) : (
              '환자를 찾아 고르세요'
            )}
          </FieldRow>

          <div>
            <FieldRow label="담당 의사 배정" field="doctor" active={activeField === 'doctor'} filled={!!draft.doctor} onActivate={() => setField('doctor')}>
              {draft.doctor ? (
                <PickedValue title={`${draft.doctor.name} 선생님`} sub={`${draft.doctor.department} · 대기 ${doctorWaitMap[draft.doctor.id] ?? 0}명`} onChange={() => setField('doctor')} />
              ) : (
                '덜 기다리는 의사로 배정하세요'
              )}
            </FieldRow>
            {activeField === 'doctor' && <DoctorInlineList onPick={(id) => pickDoctor(doorDoctors.find((d) => d.id === id)!)} />}
          </div>

          <button
            disabled={!walkReady}
            onClick={() => setConfirm(true)}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            진료 대기로 접수
          </button>
          {!walkReady && <p className="-mt-1 text-center text-xs text-muted-foreground">환자와 담당 의사를 고르면 접수됩니다</p>}

          {confirm && draft.patient && draft.doctor && (
            <ConfirmPopup
              title="이 환자를 접수할까요?"
              lines={[
                { k: '환자', v: draft.patient.name },
                { k: '생년월일', v: draft.patient.birth },
                { k: '의사', v: `${draft.doctor.name} · ${draft.doctor.department}` },
              ]}
              confirmLabel="접수"
              onCancel={() => setConfirm(false)}
              onConfirm={() => finish(`${draft.patient!.name} 님을 진료 대기로 접수했습니다`)}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── 문 = 패널 + 접힘 띠 + 완료 알림 ──────────────────────────────

const DOOR_META: Record<string, { title: string; icon: ReactNode }> = {
  reserve: { title: '새 예약', icon: <CalendarPlus className="h-5 w-5 text-primary" /> },
  register: { title: '환자 등록', icon: <UserPlus className="h-5 w-5 text-primary" /> },
  checkin: { title: '접수', icon: <QrCode className="h-5 w-5 text-primary" /> },
}

/** 왼쪽 도구 위에 얹히는 오른쪽 패널(나란히 놓여 두 얼굴이 함께 보인다) */
export function DoorRegion() {
  const { openDoor, collapsed, draft, flash, clearFlash, toggleCollapse, close } = useDoors()

  // 완료 알림(PANEL-HOME) — 문이 닫힌 뒤에도 잠깐 뜬다
  const toast = flash ? <FinishToast text={flash.text} onDone={clearFlash} /> : null

  if (!openDoor) return toast

  // 접힘 — 오른쪽 가장자리 얇은 띠(PANEL-LIVE-03). 왼쪽 화면이 넓어진다.
  if (collapsed) {
    const who = draft.patient?.name
    return (
      <>
        <button
          onClick={toggleCollapse}
          className="flex w-11 shrink-0 flex-col items-center gap-2 border-l border-border bg-card py-4 hover:bg-muted"
          aria-label="패널 펼치기"
        >
          {DOOR_META[openDoor].icon}
          <span className="text-xs text-muted-foreground" style={{ writingMode: 'vertical-rl' }}>
            {who ? `${who} 님 ` : ''}{DOOR_META[openDoor].title} 작성 중
          </span>
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        {toast}
      </>
    )
  }

  const meta = DOOR_META[openDoor]
  return (
    <>
      <aside className="flex w-[380px] max-w-[42vw] shrink-0 flex-col border-l border-border bg-card">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2">
            {meta.icon}
            <h2 className="text-base font-semibold">{meta.title}</h2>
          </div>
          {/* 접기 ≠ 닫기 — 글자로 구분(PANEL-LIVE-05). ✕는 채운 것이 사라지고 묻지 않는다(PANEL-LIVE-06). */}
          <div className="flex items-center gap-1">
            <button onClick={toggleCollapse} className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <ChevronRight className="h-3.5 w-3.5" />접기
            </button>
            <button onClick={close} className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600">
              <X className="h-3.5 w-3.5" />닫기
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {openDoor === 'reserve' && <ReserveBody />}
          {openDoor === 'register' && <RegisterBody />}
          {openDoor === 'checkin' && <CheckinBody />}
        </div>
      </aside>
      {toast}
    </>
  )
}

function FinishToast({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, 3200)
    return () => window.clearTimeout(id)
  }, [onDone])
  return (
    <div className="fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-background shadow-lg">
      <Check className="h-4 w-4 text-emerald-400" />
      {text}
    </div>
  )
}
