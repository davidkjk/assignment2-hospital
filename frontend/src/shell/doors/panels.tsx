// 세 문의 오른쪽 패널 — 데모 `routes/staff/doors/panels.tsx` 포팅.
// 패널 = 무엇을 채우나 / 왼쪽 = 채우는 도구(`PANEL-WORK-01`). 접기 ≠ 닫기(`PANEL-LIVE-05`),
// ✕는 묻지 않고 채운 것을 날린다(`PANEL-LIVE-06`).
// ✅ 예약 패널은 D4에서 실 서버로 배선됐다(로스터·하루 일정=GET /calendar · 저장=POST /appointments/phone).
// ✅ 접수 패널은 D3에서 실 서버로 배선됐다(예약 확인=CheckinForm · 당일 방문=/appointments/walkin).
// ✅ 등록 패널은 D2에서 실 서버(`api/registration.ts`)로 배선됐다.
import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, Check, ChevronLeft, ChevronRight, QrCode, UserPlus, X } from '@/components/icons'
import { ApiError } from '../../api/httpClient'
import { createWalkinAppointment } from '../../api/appointments'
import { createPhoneAppointment, getCalendar } from '../../api/calendar'
import { getTodaySummary } from '../../api/dashboard'
import { checkDuplicate, registerPatient } from '../../api/registration'
import { CheckinForm } from '../../pages/checkin/CheckinForm'
import { GapWarningDialog } from '../../pages/calendar/GapWarningDialog'
import { useDoors } from './DoorContext'
import {
  apptOverlapAt,
  blocksFor,
  closedAt,
  doctorFill,
  doctorInk,
  fmtDate,
  maskTypedBirth,
  maskTypedPhone,
  minToHHMM,
  parseVisitTime,
  slotMinutesOf,
  todayIsoLocal,
  visitInstant,
  type DoctorLite,
  type FieldId,
} from './doorData'

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

/** 예약 문의 의사 목록 — 별도 화면을 만들지 않는다(`PANEL-WORK-02`).
 *  로스터는 **그 날 격자에 열이 생기는 의사**(`GET /calendar`의 카탈로그)다 — 오늘 진료하지 않는
 *  의사도 미래에는 예약을 받을 수 있으므로 「오늘 대기 인원」 목록을 로스터로 쓰지 않는다.
 *  대기 인원을 함께 적어 "덜 기다리는 의사"로 고른다(`QUEUE-WALK-08b`).
 *  ⛔ 대기 인원은 **오늘을 고른 경우에만** 적는다 — 「지금 몇 명이 기다리나」는 다음 주 예약에
 *     대해 말해 주는 것이 없다. 근거가 없으면 말하지 않는다(`QUEUE-WALK-08c`). */
function DoctorInlineList({ dateIso, onPick }: { dateIso: string; onPick: (d: DoctorLite) => void }) {
  const isToday = dateIso === todayIsoLocal()
  const roster = useQuery({
    queryKey: ['calendar', 'roster', dateIso],
    queryFn: () => getCalendar({ from: dateIso, to: dateIso }),
  })
  const waiting = useQuery({ queryKey: ['today', 'summary'], queryFn: getTodaySummary, enabled: isToday })

  if (roster.isPending) return <p className="mt-1.5 px-1 text-xs text-muted-foreground">의사 목록을 불러오는 중…</p>
  if (roster.isError) {
    // [ERR-POS-01] 실패한 자리 바로 그 자리에서 — 막다른 길을 만들지 않는다(다시 시도를 준다).
    return (
      <div className="mt-1.5 rounded-lg border border-border/70 bg-muted/30 p-3 text-xs">
        <p role="alert" className="border-l-4 border-rose-500 pl-2 text-rose-700">
          의사 목록을 불러오지 못했습니다.
        </p>
        <button onClick={() => roster.refetch()} className="mt-2 rounded-md border border-border bg-card px-2.5 py-1 font-medium hover:bg-muted">
          다시 시도
        </button>
      </div>
    )
  }

  const rows = roster.data.doctors
  if (rows.length === 0) {
    return <p className="mt-1.5 px-1 text-xs text-muted-foreground">예약을 받을 수 있는 의사가 없습니다.</p>
  }
  // 오늘이고 대기 조회가 도착했으면 **모든 의사에게** 적는다 — 목록에 없는 의사는 대기 0명이라
  // 없는 것이지 「모르는 것」이 아니다. 접수 문(D3)이 0을 「대기 없음」으로 적는 것과 같은 태도.
  const waitOf = (id: string) =>
    isToday && waiting.data
      ? (waiting.data.doctor_waiting.find((w) => w.doctor_id === id)?.waiting_count ?? 0)
      : undefined

  return (
    <div className="mt-1.5 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border/70 bg-muted/30 p-1.5">
      {rows.map((d, i) => {
        // [CAL-COLOR-09] 색값이 아니라 팔레트의 몇 번째 — palette_index가 아직 null이라
        // 정렬 순서로 잠정 배정한다(갭 #83, gridModel.assignPalette과 같은 규칙).
        const paletteIndex = d.palette_index ?? i
        const wait = waitOf(d.id)
        return (
          <button
            key={d.id}
            onClick={() =>
              onPick({
                id: d.id,
                name: d.name,
                department: d.department_name ?? '진료과 미지정',
                waiting: wait,
                slotMinutes: d.slot_minutes ?? undefined,
                paletteIndex,
              })
            }
            className="flex w-full items-center gap-2 rounded-md bg-card px-2.5 py-2 text-left text-sm hover:bg-primary/5"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: doctorFill(paletteIndex), border: `1px solid ${doctorInk(paletteIndex)}` }}
            />
            <span className="font-medium">{d.name}</span>
            <span className="text-xs text-muted-foreground">{d.department_name ?? '진료과 미지정'}</span>
            {wait != null && (
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                {wait > 0 ? `대기 ${wait}명` : '대기 없음'}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** 접수 문의 의사 목록 — **실 대기 인원**으로 고른다(`QUEUE-WALK-08·08b·08e`).
 *  ⭐ 진료과는 「묶음 머리」로만 나온다(`QUEUE-WALK-08e`) — 누르는 필터가 아니라 읽는 순서를
 *  만드는 장치다. 의사가 5~8명이라 거를 것이 없는데 필터를 다는 것이 된다.
 *  ⛔ 「다음 자리 15:20」은 아직 안 적는다 — 의사별 다음 빈 시각을 주는 조회가 없다
 *     (갭 #87). 근거가 없으면 말하지 않는다(`QUEUE-WALK-08c`). */
function WalkinDoctorList({ onPick }: { onPick: (d: DoctorLite) => void }) {
  const q = useQuery({ queryKey: ['today', 'summary'], queryFn: getTodaySummary })

  if (q.isPending) return <p className="mt-1.5 px-1 text-xs text-muted-foreground">의사 목록을 불러오는 중…</p>
  if (q.isError) {
    // [ERR-POS-01] 실패한 자리 바로 그 자리에서 — 막다른 길을 만들지 않는다(다시 시도를 준다).
    return (
      <div className="mt-1.5 rounded-lg border border-border/70 bg-muted/30 p-3 text-xs">
        <p role="alert" className="border-l-4 border-rose-500 pl-2 text-rose-700">
          의사 목록을 불러오지 못했습니다.
        </p>
        <button onClick={() => q.refetch()} className="mt-2 rounded-md border border-border bg-card px-2.5 py-1 font-medium hover:bg-muted">
          다시 시도
        </button>
      </div>
    )
  }

  const rows = q.data.doctor_waiting
  if (rows.length === 0) {
    return <p className="mt-1.5 px-1 text-xs text-muted-foreground">오늘 진료하는 의사가 없습니다.</p>
  }

  // 진료과별 묶음 — 서버가 준 순서를 그대로 두고 처음 나온 과 순서로만 묶는다.
  const groups: { dept: string; rows: typeof rows }[] = []
  for (const r of rows) {
    const dept = r.department_name || '진료과 미지정'
    const g = groups.find((x) => x.dept === dept)
    if (g) g.rows.push(r)
    else groups.push({ dept, rows: [r] })
  }

  return (
    <div className="mt-1.5 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border/70 bg-muted/30 p-1.5">
      {groups.map((g) => (
        <div key={g.dept}>
          <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">{g.dept}</div>
          <div className="space-y-1">
            {g.rows.map((r) => (
              <button
                key={r.doctor_id}
                onClick={() => onPick({ id: r.doctor_id, name: r.doctor_name, department: g.dept, waiting: r.waiting_count })}
                className="flex w-full items-center gap-2 rounded-md bg-card px-2.5 py-2 text-left text-sm hover:bg-primary/5"
              >
                <span className="font-medium">{r.doctor_name}</span>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {r.waiting_count > 0 ? `대기 ${r.waiting_count}명` : '대기 없음'}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** 저장 직전 가운데 팝업으로 한 번 더 확인 (QUEUE-SAME-01 · PANEL-USE-02) */
function ConfirmPopup({
  title,
  lines,
  note,
  confirmLabel,
  busyLabel,
  busy = false,
  error = null,
  onConfirm,
  onCancel,
}: {
  title: string
  lines: { k: string; v: string }[]
  /** 확인 목록 아래 한 줄 안내 — 「무슨 일이 일어나나」(`QUEUE-WALK-09`). */
  note?: string
  confirmLabel: string
  /** 처리 중 라벨 — 글자를 지우지 않고 바꾼다(`BTN-BUSY-01`). */
  busyLabel?: string
  busy?: boolean
  /** 서버가 준 문장 그대로(`ERR-MSG-01`) — 실패한 버튼 **바로 위**에 붙는다(`ERR-POS-01`). */
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-4">
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-bold">{title}</h2>
        <dl className="mt-4 space-y-2 rounded-xl bg-muted/50 p-4 text-sm">
          {lines.map((l) => (
            <div key={l.k} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{l.k}</dt>
              <dd className="font-medium">{l.v}</dd>
            </div>
          ))}
        </dl>
        {note && <p className="mt-3 text-xs text-muted-foreground">{note}</p>}
        {/* [ERR-POS-01] 실패한 버튼 바로 위 붙박이 — 주의색 글자 + 좌측 바, 배경 없음. */}
        {error && (
          <p role="alert" className="mt-4 border-l-4 border-rose-500 pl-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-40">
            다시 보기
          </button>
          {/* [BTN-BUSY-02] 처리 중 다시 누름은 무시한다. [BTN-STATE-02] 처리 중은 흐린 딥틸 — ⛔회색 금지. */}
          <button
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy}
            className={[
              'rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground',
              busy ? 'bg-primary/70' : 'bg-primary hover:bg-primary/90',
            ].join(' ')}
          >
            {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 세 문의 패널 본문 ─────────────────────────────────────────────

/** 예약 문 — 환자·의사·날짜·시각·사유 (`CAL-BOOK-01`).
 *  ⭐ 세 판정이 서로 다르다:
 *    · 빗금(휴진·점심)은 **못 잡는 구간**이라 막고 이유를 말한다(`CAL-SLOT-04·11`, 서버도 400).
 *    · 다른 예약과 겹치면 **누구와 몇 분**을 적고 `[알겠습니다, 그대로 잡기]`로 넘어간다(`CAL-GAP-05·06`).
 *    · 그 밖에는 저장 직전 재확인 한 번(`CAL-BOOK-08`·`QUEUE-SAME-01`). */
function ReserveBody() {
  const { draft, activeField, setField, patch, pickDoctor, finish } = useDoors()
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  const [gap, setGap] = useState<{ slotMinutes: number; gapMinutes: number; overlap: { patientLabel: string; startLabel: string; minutes: number } } | null>(null)
  const [raceMsg, setRaceMsg] = useState<string | null>(null)
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const dateIso = draft.date ?? todayIsoLocal()
  const doctorId = draft.doctor?.id

  // 저장 직전 판정에 쓰는 그 의사·그 날 — 왼쪽 캘린더와 **같은 조회**라 캐시를 나눠 쓴다.
  const day = useQuery({
    queryKey: ['calendar', 'day', dateIso, doctorId],
    queryFn: () => getCalendar({ from: dateIso, to: dateIso, doctorIds: [doctorId!] }),
    enabled: !!doctorId,
  })

  const save = useMutation({
    mutationFn: (allowOverlap: boolean) =>
      createPhoneAppointment({
        patient_id: draft.patient!.id,
        doctor_id: doctorId!,
        // 창구 컴퓨터의 시계가 벽시계다 — 서버가 UTC로 옮겨 저장한다(`visitInstant` 주석과 같은 태도).
        start_at: `${dateIso}T${draft.time}:00`,
        reason: draft.reason ?? '',
        allow_overlap: allowOverlap,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['calendar'] })
      void qc.invalidateQueries({ queryKey: ['today'] })
      finish(`${draft.patient!.name} 님 예약을 ${fmtDate(dateIso)} ${draft.time}에 잡았습니다`)
    },
    onError: (e) => {
      // [CAL-RACE-03·04·07] 방금 다른 직원이 그 자리를 잡았다 — 패널은 그대로 두고 **시각 칸만** 비운다.
      // ⛔ 「새로고침」이나 서버 원문을 그대로 보여 주지 않는다. 다시 고를 자리로 돌려보낸다.
      if (e instanceof ApiError && e.status === 409) {
        patch({ time: undefined })
        setRaceMsg('방금 다른 직원이 이 자리를 잡았습니다. 다른 시각을 골라 주세요.')
        setField('time')
        return
      }
      setError(e instanceof Error ? e.message : '예약을 저장하지 못했습니다')
    },
  })

  const ready = draft.patient && draft.doctor && draft.date && draft.time

  /** [CAL-GAP-05] 저장 직전 — 못 잡는 구간이면 막고, 겹치면 누구와 몇 분인지 적는다. */
  function attemptSave() {
    setRaceMsg(null)
    setBlockedMsg(null)
    setError(null)
    if (!ready || !day.data || !draft.doctor) return

    const [hh, mm] = draft.time!.split(':').map(Number)
    const startMin = hh * 60 + mm
    const slotMinutes = slotMinutesOf(draft.doctor)
    const blocks = blocksFor(day.data, draft.doctor.id, dateIso)

    // [CAL-SLOT-04·11] 빗금은 경고가 아니라 막는 것이다 — 서버도 닫힌 시간을 거절한다.
    const closed = closedAt(blocks, startMin, slotMinutes)
    if (closed) {
      setBlockedMsg(`${closed.offKind} 시간이라 예약을 잡을 수 없습니다. 다른 시각을 골라 주세요.`)
      setField('time')
      return
    }

    const ov = apptOverlapAt(blocks, startMin, slotMinutes)
    if (ov) {
      setGap({
        slotMinutes,
        gapMinutes: Math.max(0, ov.startMin - startMin),
        overlap: { patientLabel: `${ov.label} 님`, startLabel: minToHHMM(ov.startMin), minutes: Math.min(startMin + slotMinutes, ov.endMin) - Math.max(startMin, ov.startMin) },
      })
      return
    }
    setConfirm(true)
  }

  return (
    <div className="space-y-4">
      <FieldRow label="환자" field="patient" active={activeField === 'patient'} filled={!!draft.patient} onActivate={() => setField('patient')}>
        {draft.patient ? (
          <PickedValue title={draft.patient.name} sub={`${draft.patient.birthText} · ${draft.patient.phoneText}`} onChange={() => setField('patient')} />
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
        {activeField === 'doctor' && <DoctorInlineList dateIso={dateIso} onPick={(d) => pickDoctor(d)} />}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="날짜" field="date" active={activeField === 'date'} filled={!!draft.date} onActivate={() => setField('date')}>
          {draft.date ? <span className="font-medium text-foreground">{fmtDate(draft.date)}</span> : '날짜를 고르세요'}
        </FieldRow>
        <FieldRow label="시각" field="time" active={activeField === 'time'} filled={!!draft.time} onActivate={() => (draft.doctor ? setField('time') : setField('doctor'))}>
          {draft.time ? <span className="font-medium tabular-nums text-foreground">{draft.time}</span> : '시각을 고르세요'}
        </FieldRow>
      </div>

      {/* [CAL-RACE-04] 무엇이 비었는지 그 자리에서 말한다 — 화면을 옮기지 않는다. */}
      {raceMsg && <p role="status" className="-mt-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">{raceMsg}</p>}
      {blockedMsg && <p role="status" className="-mt-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">{blockedMsg}</p>}

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

      {error && (
        <p role="alert" className="rounded-lg border-l-4 border-rose-500 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}

      <button
        disabled={!ready || save.isPending}
        onClick={attemptSave}
        className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
      >
        {save.isPending ? '예약하는 중…' : '예약하기'}
      </button>
      {!ready && <p className="-mt-1 text-center text-xs text-muted-foreground">환자·의사·날짜·시각을 모두 고르면 예약할 수 있습니다</p>}

      {/* [CAL-GAP-05·06] 막연한 경고가 아니라 「누구와 몇 분」. 진행 버튼에 「알겠습니다」가 든다. */}
      {gap && (
        <GapWarningDialog
          slotMinutes={gap.slotMinutes}
          gapMinutes={gap.gapMinutes}
          overlap={gap.overlap}
          onCancel={() => setGap(null)}
          onProceed={() => {
            setGap(null)
            save.mutate(true)
          }}
        />
      )}

      {confirm && draft.patient && draft.doctor && (
        <ConfirmPopup
          title="이 내용으로 예약할까요?"
          lines={[
            { k: '환자', v: draft.patient.name },
            { k: '의사', v: `${draft.doctor.name} · ${draft.doctor.department}` },
            { k: '일시', v: `${fmtDate(dateIso)} ${draft.time}` },
            { k: '사유', v: draft.reason || '—' },
          ]}
          confirmLabel="예약 확정"
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false)
            save.mutate(false)
          }}
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
  const birthOk = form.birth.replace(/\D/g, '').length === 8
  const telOk = form.tel.replace(/\D/g, '').length >= 9
  const newReady = !!form.name && !!form.sex && birthOk && telOk

  // [SHELL-DOOR-03] 소프트 중복 — 전화·생년이 **둘 다** 찬 뒤에만 묻는다(치는 도중 캐묻지 않는다).
  //  ⛔ 관문이 아니다 — 결과가 무엇이든 등록 버튼은 그대로 눌린다.
  const dupQuery = useQuery({
    queryKey: ['patients', 'duplicate-check', form.tel, form.birth],
    queryFn: () => checkDuplicate(form.tel, form.birth),
    enabled: birthOk && telOk,
    staleTime: 30_000,
    retry: false, // 힌트일 뿐이라 실패해도 조용히 없는 셈 친다(등록을 방해하지 않는다)
  })
  const dupData = dupQuery.data
  // 표시값은 서버가 가려서 준다 — 화면이 다시 가리지 않는다(`MASK-SRV-01`).
  const dup = dupData?.patient_id ? dupData : null

  const registerMut = useMutation({
    mutationFn: () =>
      registerPatient({ name: form.name, gender: form.sex, birth_date: form.birth, phone: form.tel }),
    onSuccess: ({ patient_id }) => {
      setConfirm(false)
      patch({ patient: { id: patient_id, name: form.name, birthText: maskTypedBirth(form.birth), phoneText: maskTypedPhone(form.tel) }, isNew: true })
    },
  })
  const registerError = registerMut.error instanceof ApiError ? registerMut.error.message : null

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
          <div className="text-sm text-muted-foreground">{draft.patient.birthText} · {draft.patient.phoneText}</div>
        </div>
        <p className="text-sm text-muted-foreground">이 환자로 이어서 무엇을 할까요?</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => switchDoor('appointment')} className="rounded-lg border border-border bg-card py-2.5 text-sm font-medium hover:bg-muted">
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
        <label htmlFor="reg-name" className="mb-1 block text-xs font-medium text-muted-foreground">이름</label>
        <input id="reg-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40" />
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
          <label htmlFor="reg-birth" className="mb-1 block text-xs font-medium text-muted-foreground">생년월일</label>
          <input
            id="reg-birth"
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
        <label htmlFor="reg-tel" className="mb-1 block text-xs font-medium text-muted-foreground">전화번호</label>
        <input id="reg-tel" value={form.tel} onChange={(e) => setForm({ ...form, tel: e.target.value })} inputMode="numeric" placeholder="010-0000-0000" className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm tabular-nums outline-none focus:border-ring focus:ring-2 focus:ring-ring/40" />
      </div>

      {/* 소프트 중복 확인 — 막지 않는다(F-4) */}
      {dup && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span>
            혹시 <b>{dup.name}</b>({dup.masked_birth_date}) 님 아니세요? 전화번호가 같습니다.
            {/* 막다른 길 금지 — 그 환자를 안고 예약·접수로 이어간다. 전화는 방금 직원이 친 값이다. */}
            <button
              onClick={() =>
                pickPatient({
                  id: dup.patient_id as string,
                  name: dup.name as string,
                  // 생년월일은 서버가 가려서 준 값 그대로(MASK-SRV-01),
                  // 전화는 직원이 방금 친 값이라 화면 표시만 같은 모양으로 맞춘다.
                  birthText: dup.masked_birth_date as string,
                  phoneText: maskTypedPhone(form.tel),
                })
              }
              className="ml-1 font-semibold text-amber-900 underline"
            >
              기존 기록 보기
            </button>
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
          busyLabel="등록하는 중…"
          busy={registerMut.isPending}
          error={registerError}
          onCancel={() => setConfirm(false)}
          onConfirm={() => registerMut.mutate()}
        />
      )}
    </div>
  )
}

/** 접수 문 — 예약 확인(QR·번호) / 예약 없이 오신 분(당일 방문) (F-4) */
function CheckinBody() {
  const { draft, activeField, setField, patch, pickDoctor, finish, close } = useDoors()
  const mode = draft.checkinMode ?? 'reserved'
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
        <WalkinBody
          activeField={activeField}
          setField={setField}
          pickDoctor={pickDoctor}
          finish={finish}
          draft={draft}
        />
      )}
    </div>
  )
}

/** 예약 없이 오신 분 — **한 화면**이다(`QUEUE-WALK-02`): ①환자 ②담당 의사 ③오신 시각이
 *  위에서 아래로 한 방향으로 있고 아래에 버튼 하나다(`QUEUE-WALK-19`).
 *  ⛔ `1/4` `2/4` 마법사를 쓰지 않는다 — 접수 창구는 단계 하나가 그대로 시간이다. */
function WalkinBody({
  activeField,
  setField,
  pickDoctor,
  finish,
  draft,
}: {
  activeField: FieldId
  setField: (f: FieldId) => void
  pickDoctor: (d: DoctorLite) => void
  finish: (text: string) => void
  draft: { patient?: { id: string; name: string; birthText: string; phoneText: string }; doctor?: DoctorLite }
}) {
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  // [QUEUE-WALK-14] 기본이 「지금」이라 평소에는 손댈 것이 없다.
  const [when, setWhen] = useState<'now' | 'today' | 'day'>('now')
  const [timeText, setTimeText] = useState('')
  const [dayIso, setDayIso] = useState(todayIsoLocal())

  const parsed = when === 'now' ? null : parseVisitTime(timeText)
  const parsedText = parsed ? `${String(parsed.hh).padStart(2, '0')}:${String(parsed.mm).padStart(2, '0')}` : ''
  const instant = parsed ? visitInstant(when === 'today' ? todayIsoLocal() : dayIso, parsed.hh, parsed.mm) : null
  // [QUEUE-WALK-14e] 지금보다 뒤는 **그 자리에서 바로** 알린다 — 저장할 때까지 미루지 않고,
  // 입력을 지우지도 않는다(직원이 고칠 수 있어야 한다).
  const isFuture = instant !== null && instant.getTime() > Date.now()
  const timeOk = when === 'now' || (instant !== null && !isFuture)
  const timeTyped = when !== 'now' && timeText.trim().length > 0
  const ready = !!draft.patient && !!draft.doctor && timeOk

  const walkinMut = useMutation({
    mutationFn: () =>
      createWalkinAppointment({
        patient_id: draft.patient!.id,
        doctor_id: draft.doctor!.id,
        // 사유 칸은 두지 않는다 — 한 화면은 ①환자 ②의사 ③시각뿐이다(`QUEUE-WALK-19`).
        reason: '당일 방문',
        // [QUEUE-WALK-14] 「지금」은 보내지 않는다 — 서버가 찍는다(화면 시계를 믿지 않는다).
        visit_time: when === 'now' ? null : instant!.toISOString(),
      }),
    onSuccess: () => {
      // 대기 인원·오늘 목록이 방금 바뀌었다 — 다시 읽는다.
      qc.invalidateQueries({ queryKey: ['today'] })
      qc.invalidateQueries({ queryKey: ['queue'] })
      finish(`${draft.patient!.name} 님을 진료 대기로 접수했습니다`)
    },
  })
  const saveError = walkinMut.error instanceof ApiError ? walkinMut.error.message : walkinMut.error ? '접수하지 못했습니다. 잠시 뒤 다시 시도해 주세요.' : null

  // [QUEUE-WALK-19] 환자를 고르기 전에는 아래 두 줄이 **흐리게** 있다 — 감춰서 놀라게 하지 않고,
  // 무엇이 남았는지 보이게 한다.
  const dim = draft.patient ? '' : 'opacity-50'

  return (
    <div className="space-y-4">
      <FieldRow label="환자" field="patient" active={activeField === 'patient'} filled={!!draft.patient} onActivate={() => setField('patient')}>
        {draft.patient ? (
          <PickedValue title={draft.patient.name} sub={`${draft.patient.birthText} · ${draft.patient.phoneText}`} onChange={() => setField('patient')} />
        ) : (
          '환자를 찾아 고르세요'
        )}
      </FieldRow>

      <div className={dim}>
        <FieldRow label="담당 의사 배정" field="doctor" active={activeField === 'doctor'} filled={!!draft.doctor} onActivate={() => setField('doctor')}>
          {draft.doctor ? (
            <PickedValue
              title={`${draft.doctor.name} 선생님`}
              sub={`${draft.doctor.department} · ${(draft.doctor.waiting ?? 0) > 0 ? `대기 ${draft.doctor.waiting}명` : '대기 없음'}`}
              onChange={() => setField('doctor')}
            />
          ) : (
            '덜 기다리는 의사로 배정하세요'
          )}
        </FieldRow>
        {activeField === 'doctor' && <WalkinDoctorList onPick={pickDoctor} />}
      </div>

      {/* [QUEUE-WALK-14·15] 세 번째 줄 — 이것이 없으면 지나간 시각에 온 환자의 시각이
          진료 기록에도 통계에도 남지 않는다. */}
      <div className={dim}>
        <div className="mb-1 text-xs font-medium text-muted-foreground">오신 시각</div>
        <div className="space-y-1.5 rounded-lg border border-border bg-card p-2.5 text-sm">
          {([
            ['now', '지금'],
            ['today', '지난 시각 — 오늘'],
            ['day', '지난 날'],
          ] as const).map(([k, label]) => (
            <label key={k} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="walkin-when"
                checked={when === k}
                onChange={() => setWhen(k)}
                className="h-4 w-4 accent-[var(--primary)]"
              />
              <span>{label}</span>
              {k === 'day' && when === 'day' && (
                <input
                  type="date"
                  aria-label="방문한 날짜"
                  value={dayIso}
                  max={todayIsoLocal()}
                  onChange={(e) => setDayIso(e.target.value)}
                  className="ml-1 h-8 rounded-md border border-input bg-card px-2 text-xs tabular-nums outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
                />
              )}
              {k === when && k !== 'now' && (
                <input
                  aria-label="방문한 시각"
                  value={timeText}
                  onChange={(e) => setTimeText(e.target.value)}
                  inputMode="numeric"
                  placeholder="1015"
                  className="ml-auto h-8 w-20 rounded-md border border-input bg-card px-2 text-sm tabular-nums outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
                />
              )}
            </label>
          ))}
          {/* [QUEUE-WALK-14b] 콜론을 안 쳐도 되고, 친 값이 무엇으로 읽혔는지 그 자리에서 보여준다. */}
          {when !== 'now' && parsed && !isFuture && (
            <p className="pl-6 text-xs tabular-nums text-muted-foreground">{`${parsedText}에 오신 것으로 적습니다`}</p>
          )}
          {when !== 'now' && isFuture && (
            <p role="alert" className="border-l-4 border-rose-500 pl-2 text-xs text-rose-700">
              아직 오지 않은 시각입니다
            </p>
          )}
          {when !== 'now' && timeTyped && !parsed && (
            <p role="alert" className="border-l-4 border-rose-500 pl-2 text-xs text-rose-700">
              시각은 <b>1015</b>처럼 3~4자리 숫자로 적어 주세요
            </p>
          )}
        </div>
      </div>

      <button
        disabled={!ready}
        onClick={() => setConfirm(true)}
        className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
      >
        진료 대기로 접수
      </button>
      {!ready && (
        <p className="-mt-1 text-center text-xs text-muted-foreground">
          {draft.patient && draft.doctor ? '오신 시각을 확인해 주세요' : '환자와 담당 의사를 고르면 접수됩니다'}
        </p>
      )}

      {/* [QUEUE-WALK-09] 저장 직전 확인 — 이름 + 생년월일을 마지막으로 보여준다(요구사항 3.5). */}
      {confirm && draft.patient && draft.doctor && (
        <ConfirmPopup
          title="이 환자를 접수할까요?"
          lines={[
            { k: '환자', v: draft.patient.name },
            { k: '생년월일', v: draft.patient.birthText },
            { k: '의사', v: `${draft.doctor.name} · ${draft.doctor.department}` },
            {
              k: '오신 시각',
              v: when === 'now' || !parsed ? '지금' : `${when === 'day' ? `${dayIso} ` : ''}${parsedText}`,
            },
          ]}
          // [QUEUE-WALK-11] 맨 뒤에 붙는다 — 먼저 봐야 하면 넣은 뒤 순서를 끌어 옮겨 사유를 남긴다.
          note="추가하면 「진료 대기」 맨 뒤에 들어갑니다."
          confirmLabel="접수"
          busyLabel="접수하는 중…"
          busy={walkinMut.isPending}
          error={saveError}
          onCancel={() => setConfirm(false)}
          onConfirm={() => walkinMut.mutate()}
        />
      )}
    </div>
  )
}

const DOOR_META: Record<string, { title: string; icon: ReactNode }> = {
  appointment: { title: '새 예약', icon: <CalendarPlus className="h-5 w-5 text-primary" /> },
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
      <aside aria-label={meta.title} className="flex w-[380px] max-w-[42vw] shrink-0 flex-col border-l border-border bg-card">
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
          {openDoor === 'appointment' && <ReserveBody />}
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
