// 왼쪽 변신 도구 — 데모 `routes/staff/doors/surfaces.tsx` 포팅.
// `PANEL-WORK-01/02`: 패널의 어느 칸을 채우느냐에 따라 왼쪽 큰 자리가 「그 칸을 채우는 도구」로 바뀐다.
// ✅ D3: 환자 검색은 정본 부품 `PatientSearch`(mode="pick")가 한다 — 데모의 가짜 표를 걷어냈다.
// ✅ D4: 일간 캘린더·작은 달력이 실 서버(`GET /calendar`)에 붙었다. 빗금(휴진·점심) 판정은
//        서버 `resolve_day` 하나뿐이라(`SCHED-EXC-12`) 화면이 자기 계산을 갖지 않는다.
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, UserRound, AlertTriangle } from '@/components/icons'
import { getCalendar } from '../../api/calendar'
import { StatusBadge } from '../../components/staff-ui'
import { PatientSearch } from '../../pages/patients/PatientSearch'
import { hospitalToday } from '../../lib/clock'
import { useDoors } from './DoorContext'
import {
  apptOverlapAt,
  blocksFor,
  closedAt,
  doctorFill,
  doctorInk,
  DAY_START_MIN,
  DAY_END_MIN,
  snapMin,
  minToHHMM,
  slotMinutesOf,
  fmtDate,
  pastMinOn,
  type DayBlock,
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

/** 고른(혹은 호버한) 자리가 무엇인가 — 셋은 **동작이 다르다**(`CAL-PAST` / `CAL-SLOT` / `CAL-GAP`). */
type SpotKind =
  | { kind: 'past' }
  | { kind: 'closed'; block: DayBlock }
  | { kind: 'overlap'; block: DayBlock }
  | { kind: 'free' }

/** 의사를 고른 뒤 → 그 의사의 하루 비례 캘린더 (PANEL-WORK-02·CAL-TIME-02/03) —
 *  빈 곳을 누르면 5분 격자에 붙여 그 의사 진료시간만큼 잡는다.
 *  ⭐ 못 잡는 자리는 **누르기 전에** 갈린다: 지난 시각(`CAL-PAST-01`)과 빗금(`CAL-SLOT-04`)은
 *     막고 이유를 말하고, 예약끼리의 겹침만 경고 뒤 진행할 수 있다(`CAL-GAP-06`). */
function DoctorDayCalendar({ pickable }: { pickable: boolean }) {
  const { draft, pickSlot, patch, switchDoor } = useDoors()
  const d = draft.doctor!
  const dateIso = draft.date ?? hospitalToday()

  // 패널의 저장 직전 판정과 **같은 조회**다 — 캐시를 나눠 써 두 곳이 다른 하루를 보지 않는다.
  const day = useQuery({
    queryKey: ['calendar', 'day', dateIso, d.id],
    queryFn: () => getCalendar({ from: dateIso, to: dateIso, doctorIds: [d.id] }),
  })

  // [CAL-TIME-09] 진료 길이는 **그 날 요일**의 규칙이다 — 날짜를 옮기면 달라질 수 있어
  // 그 날 카탈로그가 오면 문이 들고 다니는 값을 맞춘다(패널의 겹침 계산도 이 값을 쓴다).
  const servedSlot = day.data?.doctors.find((x) => x.id === d.id)?.slot_minutes ?? null
  useEffect(() => {
    if (servedSlot != null && servedSlot !== d.slotMinutes) {
      patch({ doctor: { ...d, slotMinutes: servedSlot } })
    }
  }, [servedSlot]) // eslint-disable-line react-hooks/exhaustive-deps

  const blocks = day.data ? blocksFor(day.data, d.id, dateIso) : []
  const slotMinutes = slotMinutesOf(d)
  const pastMin = pastMinOn(dateIso)
  const height = (DAY_END_MIN - DAY_START_MIN) * PPM
  const yOf = (min: number) => (min - DAY_START_MIN) * PPM

  const laneRef = useRef<HTMLDivElement>(null)
  const [hoverMin, setHoverMin] = useState<number | null>(null)
  /** 못 잡는 자리를 눌렀을 때의 안내 — 막고 끝내지 않고 갈 길을 준다(`CAL-PAST-02`). */
  const [notice, setNotice] = useState<{ text: string; toWalkin: boolean } | null>(null)

  const minFromEvent = (e: React.PointerEvent | React.MouseEvent): number => {
    const el = laneRef.current
    if (!el) return DAY_START_MIN
    const rect = el.getBoundingClientRect()
    const rawMin = DAY_START_MIN + (e.clientY - rect.top) / PPM
    return snapMin(rawMin)
  }

  /** 그 자리가 무엇인지 — 판정 순서가 곧 우선순위다(지난 시각 > 빗금 > 겹침). */
  const spotAt = (startMin: number): SpotKind => {
    if (startMin < pastMin) return { kind: 'past' }
    const closed = closedAt(blocks, startMin, slotMinutes)
    if (closed) return { kind: 'closed', block: closed }
    const ov = apptOverlapAt(blocks, startMin, slotMinutes)
    if (ov) return { kind: 'overlap', block: ov }
    return { kind: 'free' }
  }

  const picked = draft.time ? toMinLocal(draft.time) : null
  const previewMin = pickable ? (hoverMin ?? picked) : null
  const preview = previewMin != null ? spotAt(previewMin) : null

  function handleClick(e: React.MouseEvent) {
    const startMin = minFromEvent(e)
    const spot = spotAt(startMin)
    if (spot.kind === 'past') {
      // [CAL-PAST-02] 막고 끝내지 않는다 — 이미 온 환자라면 당일 방문 등록이 갈 길이다.
      setNotice({ text: '이미 지난 시간입니다.', toWalkin: true })
      return
    }
    if (spot.kind === 'closed') {
      // [CAL-SLOT-04·11] 빗금은 예약을 못 잡는 구간이다 — 서버도 400으로 거절한다.
      setNotice({ text: `${spot.block.offKind} 시간이라 예약을 잡을 수 없습니다.`, toWalkin: false })
      return
    }
    setNotice(null)
    pickSlot(dateIso, minToHHMM(startMin))
  }

  const gridLines: number[] = []
  for (let t = DAY_START_MIN; t <= DAY_END_MIN; t += 30) gridLines.push(t)

  return (
    <div className="mx-auto max-w-2xl">
      <SurfaceHead
        label={pickable ? '시간을 고르는 중' : `${d.name} 선생님 일정`}
        hint={
          pickable
            ? `빈 곳을 누르면 5분 단위로 붙어 ${slotMinutes}분 예약이 잡힙니다`
            : '얼마나 차 있는지 보고 배정하세요 · 빗금은 휴진·점심'
        }
        icon={pickable ? <Clock3 className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}
      />
      <div className="mb-3 flex items-center justify-between rounded-xl border border-border/70 bg-card px-4 py-2.5 shadow-[var(--shadow-panel)]">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: doctorFill(d.paletteIndex), border: `1px solid ${doctorInk(d.paletteIndex)}` }} />
          <span className="font-semibold">{d.name}</span>
          <span className="text-sm text-muted-foreground">· {d.department} · {slotMinutes}분 진료</span>
        </div>
        <span className="text-sm tabular-nums text-muted-foreground">{fmtDate(dateIso)}</span>
      </div>

      {/* 못 잡는 자리를 눌렀을 때 — 막다른 길을 만들지 않는다(`CAL-PAST-02`) */}
      {notice && (
        <div role="status" className="mb-2 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>{notice.text}</span>
          {notice.toWalkin && (
            <button
              onClick={() => switchDoor('checkin')}
              className="ml-auto shrink-0 rounded-md border border-amber-400 bg-card px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              당일 방문 등록
            </button>
          )}
        </div>
      )}

      {/* 고른 시각 · 겹침 경고 (CAL-BOOK-04b·CAL-GAP-05) */}
      {pickable && previewMin != null && preview && preview.kind !== 'past' && (
        <div className={`mb-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${preview.kind === 'free' ? 'border-primary/30 bg-primary/5 text-foreground' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
          {preview.kind === 'free' ? <Clock3 className="h-4 w-4 shrink-0 text-primary" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />}
          <span className="tabular-nums font-medium">{minToHHMM(previewMin)}–{minToHHMM(previewMin + slotMinutes)}</span>
          {preview.kind === 'closed' && <span className="text-xs">{preview.block.offKind} 시간이라 잡을 수 없습니다</span>}
          {preview.kind === 'overlap' && <span className="text-xs">{preview.block.label} 님과 겹칩니다 — 그래도 잡을 수 있습니다</span>}
          {preview.kind === 'free' && (
            <span className="text-xs text-muted-foreground">{hoverMin != null ? '누르면 이 시각으로 예약됩니다' : '고른 시각'}</span>
          )}
        </div>
      )}

      {day.isError && (
        <p role="alert" className="mb-2 rounded-lg border-l-4 border-rose-500 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          일정을 불러오지 못했습니다.{' '}
          <button onClick={() => day.refetch()} className="font-medium underline">다시 시도</button>
        </p>
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
            data-testid="day-lane"
            className={`relative flex-1 rounded-md bg-muted/20 ${pickable ? 'cursor-pointer' : ''}`}
            onPointerMove={pickable ? (e) => setHoverMin(minFromEvent(e)) : undefined}
            onPointerLeave={pickable ? () => setHoverMin(null) : undefined}
            onClick={pickable ? handleClick : undefined}
          >
            {gridLines.map((t) => (
              <div key={t} className="pointer-events-none absolute inset-x-0 border-t border-border/40" style={{ top: yOf(t) }} />
            ))}

            {/* [CAL-PAST-01] 지난 시각 — 흐리게 두고 「지난 시간」이라 **글자로** 적는다.
                색만으로 구분하지 않는다(요구사항 7절). */}
            {pastMin > DAY_START_MIN && (
              <div
                className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-end bg-muted/60 px-2 py-0.5"
                style={{ height: Math.min(pastMin, DAY_END_MIN) - DAY_START_MIN > 0 ? (Math.min(pastMin, DAY_END_MIN) - DAY_START_MIN) * PPM : 0 }}
              >
                <span className="text-[11px] font-medium text-muted-foreground">지난 시간</span>
              </div>
            )}

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
                  style={{ top, height: h, background: doctorFill(d.paletteIndex), color: doctorInk(d.paletteIndex), boxShadow: '0 1px 0 var(--color-surface)' }}>
                  <span className="text-[11px] font-semibold leading-tight">{b.label}</span>
                  {h >= 26 && <div className="truncate text-[10px] leading-tight opacity-70">{b.sub}</div>}
                </div>
              )
            })}

            {/* 호버·고른 자리 미리보기 (CAL-TIME-05·BOOK-04b) — 지난 시각에는 그리지 않는다. */}
            {pickable && previewMin != null && preview && preview.kind !== 'past' && (
              <div className={`pointer-events-none absolute inset-x-1 rounded-md border-2 ${preview.kind === 'free' ? 'border-primary bg-primary/10' : 'border-amber-500 bg-amber-400/15'}`}
                style={{ top: yOf(previewMin), height: slotMinutes * PPM - 1 }}>
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

/** 날짜 칸 → 작은 달력 (PANEL-WORK-02) — 지난 날은 흐리게 고를 수 없다(`CAL-PAST-01`).
 *  ⭐ 데모에는 달 이동이 없었으나(이번 달 고정) 예약은 **미래를 잡는 일**이라 다음 달로 못 가면
 *     막다른 길이 된다 — 그래서 `[‹][›]`를 둔다(`CAL-NAV-01`과 같은 장치).
 *  ⭐ 미래 끝은 **서버가 정한다**(`CAL-BOOK-13`) — 그 너머는 추천 자리가 아예 없고 서버도
 *     400으로 거절한다. ⛔ 화면이 「8주」를 박지 않는다: 병원이 범위를 바꾸면 서버는 따라가는데
 *     화면만 옛 값에서 멈춘다(갭 #47 재발). 막을 때는 **언제까지인지**를 함께 적는다. */
function MonthPicker() {
  const { draft, patch, setField } = useDoors()
  // ⭐ 「오늘」도 달력이 여는 달도 **병원 시계**로 정한다(`TIME-TZ-01`). 날짜 비교는 문자열이다 —
  //    Date 자정을 만들면 로컬 자정과 병원 자정이 갈려 같은 병이 되돌아온다.
  const todayIso = hospitalToday()
  const [selY, selM] = (draft.date ?? todayIso).split('-').map(Number)
  const [view, setView] = useState(() => new Date(selY, selM - 1, 1))

  // 로스터와 **같은 조회**라 캐시를 나눠 쓴다 — 경계를 따로 물으러 가지 않는다.
  const cal = useQuery({
    queryKey: ['calendar', 'roster', todayIso],
    queryFn: () => getCalendar({ from: todayIso, to: todayIso }),
  })
  const horizonIso = cal.data?.booking_horizon_date ?? null

  const year = view.getFullYear()
  const month = view.getMonth() // 0-based
  const first = new Date(year, month, 1).getDay()
  const days = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  // 지난 달로는 갈 수 있으나 지난 날은 못 고른다 — 이번 달보다 앞이면 이동 자체를 막는다.
  const atFirstMonth = `${year}-${String(month + 1).padStart(2, '0')}` === todayIso.slice(0, 7)
  // 다음 달의 1일이 경계를 넘으면 더 갈 곳이 없다(`CAL-BOOK-13` · `BOOK-DATE-06`과 같은 취지).
  const nextMonthFirstIso = `${month === 11 ? year + 1 : year}-${String(month === 11 ? 1 : month + 2).padStart(2, '0')}-01`
  const atLastMonth = horizonIso != null && nextMonthFirstIso > horizonIso

  const pick = (day: number) => {
    // 날짜가 바뀌면 그 날의 빈자리가 다르므로 골라 둔 시각을 버린다(다른 날의 09:30을 들고 가지 않는다).
    patch({ date: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`, time: undefined })
    setField('time')
  }

  return (
    <div className="mx-auto max-w-md">
      <SurfaceHead label="날짜를 고르는 중" hint="예약할 날짜를 누르세요 · 지난 날짜는 고를 수 없습니다" icon={<CalendarDays className="h-5 w-5" />} />
      <div className="rounded-xl border border-border/70 bg-card p-5 shadow-[var(--shadow-panel)]">
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => setView(new Date(year, month - 1, 1))}
            disabled={atFirstMonth}
            aria-label="이전 달"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-base font-semibold">{year}년 {month + 1}월</div>
          <button
            onClick={() => setView(new Date(year, month + 1, 1))}
            disabled={atLastMonth}
            aria-label="다음 달"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {/* 막을 때는 이유를 함께 준다 — 「8주」가 아니라 **그 날짜**로 적는다(직원이 세어보지 않게). */}
        {atLastMonth && horizonIso && (
          <p className="mb-3 text-center text-xs text-muted-foreground">
            예약은 {fmtDate(horizonIso)}까지 가능합니다
          </p>
        )}
        <div className="mb-1 grid grid-cols-7 text-center text-xs text-muted-foreground">
          {['일', '월', '화', '수', '목', '금', '토'].map((w) => (
            <div key={w} className="py-1">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day == null) return <div key={i} />
            const cellIso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const past = cellIso < todayIso
            const isToday = cellIso === todayIso
            const beyond = horizonIso != null && cellIso > horizonIso
            return (
              <button
                key={i}
                disabled={past || beyond}
                onClick={() => pick(day)}
                className={[
                  'aspect-square rounded-lg text-sm tabular-nums transition-colors',
                  past || beyond ? 'text-muted-foreground/40' : 'hover:bg-primary/10',
                  isToday ? 'bg-primary/10 font-bold text-primary ring-1 ring-primary/30' : '',
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
