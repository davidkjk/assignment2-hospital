// 왼쪽 변신 도구 — 데모 `routes/staff/doors/surfaces.tsx` 포팅.
// `PANEL-WORK-01/02`: 패널의 어느 칸을 채우느냐에 따라 왼쪽 큰 자리가 「그 칸을 채우는 도구」로 바뀐다.
// ✅ D3: 환자 검색은 정본 부품 `PatientSearch`(mode="pick")가 한다 — 데모의 가짜 표를 걷어냈다.
// ⚠️ 일간 캘린더·작은 달력 데이터는 아직 `doorData`의 데모 가짜값이다 — TODO(D4 배선).
import { useRef, useState } from 'react'
import { CalendarDays, Clock3, UserRound, AlertTriangle } from '@/components/icons'
import { StatusBadge } from '../../components/staff-ui'
import { PatientSearch } from '../../pages/patients/PatientSearch'
import { useDoors } from './DoorContext'
import {
  buildBlocks,
  DAY_START_MIN,
  DAY_END_MIN,
  snapMin,
  overlapAt,
  minToHHMM,
  slotMinutesOf,
  fmtDate,
  TODAY_ISO,
  type FieldId,
} from './doorData'

// PANEL-WORK-01/02: 패널의 어느 칸을 채우느냐에 따라 왼쪽 큰 자리가 「그 칸을 채우는 도구」로 바뀐다.
// 왼쪽이 왜 바뀌었는지 글자로 설명한다(PANEL-WORK-03).

/** 왼쪽 도구 공통 머리 — 지금 무엇을 고르는 중인지 (PANEL-WORK-03) */
function SurfaceHead({ label, hint, icon }: { label: string; hint: string; icon: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
      <div>
        <div className="text-base font-semibold">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
    </div>
  )
}

/** 환자 칸 → **`/patients`와 같은 검색 부품 그대로** (`PANEL-FIND-01` · `QUEUE-WALK-02c`).
 *  ⭐ 데모의 가짜 표를 베끼지 않는다 — `SEARCH-BOX-03`이 「전역 환자 검색은 창구 하나」를 못박았고
 *  `PatientSearch`(mode="pick")가 그 정본이다. 직원이 두 가지 검색을 따로 배우지 않는다. */
function PatientSearchSurface() {
  const { pickPatient } = useDoors()
  return (
    <div className="mx-auto max-w-4xl">
      <SurfaceHead
        label="환자를 고르는 중"
        hint="이름·전화·생년월일 어느 것으로도 찾을 수 있습니다 · 줄을 누르면 선택됩니다"
        icon={<UserRound className="h-5 w-5" />}
      />
      {/* [MASK-SRV-01] 가린 값은 서버가 준 문자열 그대로 안고 간다 — 화면이 다시 가리지 않는다. */}
      <PatientSearch
        mode="pick"
        onPick={(_id, row) =>
          pickPatient({
            id: row.patient_id,
            name: row.name,
            birthText: row.masked_birth_date,
            phoneText: row.masked_phone,
            today: row.today_status
              ? { status: row.today_status, time: row.today_appointment_time }
              : undefined,
          })
        }
      />
    </div>
  )
}

// 비례 캘린더 배율 — 1분당 픽셀. 5분(=8px)도 눌러지게 넉넉히.
const PPM = 1.6
const GUTTER = 48

/** 의사를 고른 뒤 → 그 의사의 하루 비례 캘린더 (PANEL-WORK-02·CAL-TIME-02/03) —
 *  빈 곳을 누르면 5분 격자에 붙여 그 의사 진료시간만큼 잡는다. 겹치면 경고(막지 않음). */
function DoctorDayCalendar({ pickable }: { pickable: boolean }) {
  const { draft, pickSlot } = useDoors()
  const d = draft.doctor!
  const blocks = buildBlocks(d)
  const height = (DAY_END_MIN - DAY_START_MIN) * PPM
  const yOf = (min: number) => (min - DAY_START_MIN) * PPM

  const laneRef = useRef<HTMLDivElement>(null)
  const [hoverMin, setHoverMin] = useState<number | null>(null)

  const minFromEvent = (e: React.PointerEvent | React.MouseEvent): number => {
    const el = laneRef.current
    if (!el) return DAY_START_MIN
    const rect = el.getBoundingClientRect()
    const rawMin = DAY_START_MIN + (e.clientY - rect.top) / PPM
    return snapMin(rawMin)
  }

  const picked = draft.time ? toMinLocal(draft.time) : null
  const previewMin = pickable ? (hoverMin ?? picked) : null
  const previewOverlap = previewMin != null ? overlapAt(d, previewMin) : null

  const gridLines: number[] = []
  for (let t = DAY_START_MIN; t <= DAY_END_MIN; t += 30) gridLines.push(t)

  return (
    <div className="mx-auto max-w-2xl">
      <SurfaceHead
        label={pickable ? '시간을 고르는 중' : `${d.name} 선생님 오늘 일정`}
        hint={
          pickable
            ? `빈 곳을 누르면 5분 단위로 붙어 ${d.slotMinutes}분 예약이 잡힙니다`
            : '오늘이 얼마나 차 있는지 보고 배정하세요 · 빗금은 휴진·점심'
        }
        icon={pickable ? <Clock3 className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}
      />
      <div className="mb-3 flex items-center justify-between rounded-xl border border-border/70 bg-card px-4 py-2.5 shadow-[var(--shadow-panel)]">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: d.fill, border: `1px solid ${d.ink}` }} />
          <span className="font-semibold">{d.name}</span>
          <span className="text-sm text-muted-foreground">· {d.department} · {d.slotMinutes}분 진료</span>
        </div>
        <span className="text-sm tabular-nums text-muted-foreground">{fmtDate(TODAY_ISO)}</span>
      </div>

      {/* 고른 시각 · 겹침 경고 (CAL-BOOK-04b·CAL-GAP) */}
      {pickable && previewMin != null && (
        <div className={`mb-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${previewOverlap ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-primary/30 bg-primary/5 text-foreground'}`}>
          {previewOverlap ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" /> : <Clock3 className="h-4 w-4 shrink-0 text-primary" />}
          <span className="tabular-nums font-medium">{minToHHMM(previewMin)}–{minToHHMM(previewMin + slotMinutesOf(d))}</span>
          {previewOverlap
            ? <span className="text-xs">{previewOverlap.offKind ?? '다른 예약'}과 겹칩니다 — 그래도 잡을 수 있습니다</span>
            : <span className="text-xs text-muted-foreground">{hoverMin != null ? '누르면 이 시각으로 예약됩니다' : '고른 시각'}</span>}
        </div>
      )}

      <div className="overflow-y-auto rounded-xl border border-border/70 bg-card p-3 shadow-[var(--shadow-panel)]" style={{ maxHeight: 'calc(100vh - 20rem)' }}>
        <div className="flex" style={{ height }}>
          {/* 시간축 */}
          <div className="relative shrink-0" style={{ width: GUTTER }}>
            {gridLines.map((t, i) => (
              <div key={t} className={`absolute right-2 text-[11px] tabular-nums text-muted-foreground ${i === 0 ? '' : '-translate-y-1/2'}`} style={{ top: yOf(t) + (i === 0 ? 1 : 0) }}>
                {minToHHMM(t)}
              </div>
            ))}
          </div>

          {/* 레인 */}
          <div
            ref={laneRef}
            className={`relative flex-1 rounded-md bg-muted/20 ${pickable ? 'cursor-pointer' : ''}`}
            onPointerMove={pickable ? (e) => setHoverMin(minFromEvent(e)) : undefined}
            onPointerLeave={pickable ? () => setHoverMin(null) : undefined}
            onClick={pickable ? (e) => pickSlot(TODAY_ISO, minToHHMM(minFromEvent(e))) : undefined}
          >
            {gridLines.map((t) => (
              <div key={t} className="pointer-events-none absolute inset-x-0 border-t border-border/40" style={{ top: yOf(t) }} />
            ))}

            {/* 예약·휴진 블록 (색 사용중 = 그 자리가 찬 것을 색으로) */}
            {blocks.map((b, i) => {
              const top = yOf(b.startMin)
              const h = (b.endMin - b.startMin) * PPM - 1
              if (b.kind === 'off') {
                return (
                  <div key={i} className="pointer-events-none absolute inset-x-1 flex items-start rounded-md border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground"
                    style={{ top, height: h, backgroundImage: 'repeating-linear-gradient(45deg, rgba(100,116,139,0.10) 0 6px, transparent 6px 12px)' }}>
                    {h >= 18 && <span className="tabular-nums">{b.label} {minToHHMM(b.startMin)}–{minToHHMM(b.endMin)}</span>}
                  </div>
                )
              }
              return (
                <div key={i} className="pointer-events-none absolute inset-x-1 overflow-hidden rounded-md px-2 py-0.5"
                  style={{ top, height: h, background: d.fill, color: d.ink, boxShadow: '0 1px 0 var(--color-surface)' }}>
                  <span className="text-[11px] font-semibold leading-tight">{b.label}</span>
                  {h >= 26 && <div className="truncate text-[10px] leading-tight opacity-70">{b.sub}</div>}
                </div>
              )
            })}

            {/* 호버·고른 자리 미리보기 (CAL-TIME-05·BOOK-04b) */}
            {pickable && previewMin != null && (
              <div className={`pointer-events-none absolute inset-x-1 rounded-md border-2 ${previewOverlap ? 'border-amber-500 bg-amber-400/15' : 'border-primary bg-primary/10'}`}
                style={{ top: yOf(previewMin), height: slotMinutesOf(d) * PPM - 1 }}>
                <span className="absolute left-1 top-0.5 rounded bg-card/90 px-1 text-[10px] font-medium tabular-nums text-foreground">
                  {minToHHMM(previewMin)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function toMinLocal(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** 날짜 칸 → 작은 달력 (PANEL-WORK-02) — 데모는 이번 달만, 지난 날은 흐리게(CAL-PAST) */
function MonthPicker() {
  const { patch, setField } = useDoors()
  const [, m, dToday] = TODAY_ISO.split('-').map(Number)
  const year = 2026
  const first = new Date(year, m - 1, 1).getDay()
  const days = new Date(year, m, 0).getDate()
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const pick = (day: number) => {
    patch({ date: `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}` })
    setField('time')
  }
  return (
    <div className="mx-auto max-w-md">
      <SurfaceHead label="날짜를 고르는 중" hint="예약할 날짜를 누르세요 · 지난 날짜는 고를 수 없습니다" icon={<CalendarDays className="h-5 w-5" />} />
      <div className="rounded-xl border border-border/70 bg-card p-5 shadow-[var(--shadow-panel)]">
        <div className="mb-3 text-center text-base font-semibold">{m}월 {year}</div>
        <div className="mb-1 grid grid-cols-7 text-center text-xs text-muted-foreground">
          {['일', '월', '화', '수', '목', '금', '토'].map((w) => (
            <div key={w} className="py-1">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day == null) return <div key={i} />
            const past = day < dToday
            const today = day === dToday
            return (
              <button
                key={i}
                disabled={past}
                onClick={() => pick(day)}
                className={[
                  'aspect-square rounded-lg text-sm tabular-nums transition-colors',
                  past ? 'text-muted-foreground/40' : 'hover:bg-primary/10',
                  today ? 'bg-primary/10 font-bold text-primary ring-1 ring-primary/30' : '',
                ].join(' ')}
              >
                {day}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** 환자를 고른 뒤 → 그 환자 정보를 왼쪽에 편다 (창구에서 환자와 이야기하며 다음 칸을 채운다).
 *  전체 상세 route가 아니라 지금 필요한 만큼의 요약 카드다(PANEL-LIVE-02와 같은 취지). */
function PatientDetailSurface() {
  const { draft } = useDoors()
  const p = draft.patient!
  return (
    <div className="mx-auto max-w-2xl">
      <SurfaceHead
        label={`${p.name} 님`}
        hint="이 환자와 이야기하며 오른쪽에서 담당 의사를 고르세요"
        icon={<UserRound className="h-5 w-5" />}
      />
      <div className="rounded-xl border border-border/70 bg-card p-5 shadow-[var(--shadow-panel)]">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold">{p.name}</span>
          {p.today && <StatusBadge status={p.today.status ?? 'none'} />}
        </div>
        {/* [MASK-SRV-01] 서버가 가려서 준 문자열 그대로 — 펼치려면 열람 기록이 남는 별도 창구다(갭 #35). */}
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">생년월일</dt>
            <dd className="tabular-nums">{p.birthText}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">전화번호</dt>
            <dd className="tabular-nums">{p.phoneText}</dd>
          </div>
          {p.today?.time && (
            <div>
              <dt className="text-xs text-muted-foreground">오늘 예약</dt>
              <dd className="tabular-nums">{p.today.time}</dd>
            </div>
          )}
        </dl>
      </div>
      {/* TODO(후속): 지난 방문 이력은 환자 상세 계약(`PTDET-*`, api/patients.ts)이 이미 있다 —
          D3 범위 밖이라 아직 안 이었다. 데모의 가짜 이력 카드는 걷어냈다(없는 것을 있는 척하지 않는다). */}
    </div>
  )
}

/** 지금 활성 칸에 맞는 왼쪽 도구. 도구가 없으면 null(= 보던 화면 그대로, SHELL-ACT-04). */
export function workSurfaceFor(
  _door: string,
  field: FieldId,
  hasDoctor: boolean,
  hasPatient: boolean,
): React.ReactNode | null {
  if (field === 'patient' || field === 'find') return <PatientSearchSurface />
  if (field === 'date') return <MonthPicker />
  if ((field === 'time' || field === 'doctor') && hasDoctor)
    return <DoctorDayCalendar pickable={field === 'time'} />
  // 환자만 고른 상태(의사 고르는 중)에는 그 환자 정보를 왼쪽에 둔다
  if (field === 'doctor' && hasPatient) return <PatientDetailSurface />
  return null
}
