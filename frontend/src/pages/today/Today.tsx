import { useState } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { StaffPage } from '../../components/staff-ui'
import { EmptyState } from '../../components/EmptyState'
import { LoadingState } from '../../components/LoadingState'
import {
  getTodaySummary,
  type TodaySummary,
  type PatientRow,
} from '../../api/dashboard'
import { revealContact } from '../../api/patients'
import { closeStaleAppointment, transitionStatus } from '../../api/appointments'
import { UserRound } from '../../components/icons'

// 오늘의 현황 (/today) — TODAY-*.
// 데모 뼈대(2열 레이아웃·카드·시각 레일, E-6 사용자 검수 2026-08-22)에 실 데이터(getTodaySummary)를
// 배선했다. 「지금 처리할 것」(문제 4카드)이 주 컬럼, 「오늘 요약」은 오른쪽 sticky 레일 —
// 위계(문제 우선)는 정본 TODAY-LAY-01 그대로, 위치만 넓은 화면에서 오른쪽(E-6에서 승인).
//
// ⏳ 이월(일정변경 영향 예약 데이터 미구현): 처리 도장(TODAY-RESCHED-04)과 「예약 옮기기/취소/그대로
//    두기」 세 버튼은 일정변경 영향 예약(TODAY-RESCHED-01~22)이 붙을 때 산다. 지금 「확인 필요 예약」은
//    상담 문의(needs_attention)뿐이라 버튼은 [예약·상담 보기] 하나다(TODAY-RESCHED-24).

const REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

type CardKind = 'longwait' | 'noshow' | 'yday' | 'needs' | 'pending'

/** 데모 카드/행이 소비하는 통합 행 모양 — 실 4종 행을 여기로 모은다. */
interface UiRow {
  appointmentId: string
  patientId: string
  name?: string
  maskedBirth?: string
  dept?: string
  doctor?: string
  rail: string // 시각 레일 텍스트
  railDate?: string // 지난 날짜 예약이면 시각 위에 작게(TODAY-YDAY-03) — 좁은 레일에서 줄바꿈 대신 두 줄(L23)
  railPast: boolean // 지난/미래 예약이면 옅은 회색(TODAY-ROW-02)
  reason?: string
  slotLabel?: string // 마감 확인창에 보이는 「날짜·시각」(전일 미완료만)
  updatedAt?: string // [TODAY-YDAY-04][TODAY-CONFIRM-01] 낙관적 잠금 열쇠(전일 미완료 마감·확정 대기 확정)
  slotDate?: string // [TODAY-CONFIRM-01] 확정 대기 날짜 묶음용 원본 날짜(yyyy-mm-dd)
}
interface UiCard {
  kind: CardKind
  title: string
  /** 카드 머리에 붙는 날짜 — 전일 미완료가 전부 같은 날일 때 그 날짜를 한 번만 보인다(TODAY-YDAY-03). */
  headerNote?: string
  rows: UiRow[]
}

const hhmm = (t: string) => t.slice(0, 5)
/** 지난 날짜 행의 날짜(TODAY-YDAY-03) — "2026-08-02" → "8/2"(앞의 0을 뗀다). 시각은 hhmm으로 따로 준다. */
const md = (d: string) => {
  const [, m, day] = d.split('-')
  return `${Number(m)}/${Number(day)}`
}

/** 실 행(PatientRow 파생)의 공통 필드를 UiRow로. */
function baseRow(r: PatientRow): Omit<UiRow, 'rail' | 'railPast'> {
  return {
    appointmentId: r.appointment_id ?? '',
    patientId: r.patient_id,
    name: r.name,
    maskedBirth: r.masked_birth_date,
    dept: r.department_name,
    doctor: r.doctor_name,
  }
}

/** 실 요약을 데모 카드 배열로(TODAY-ORDER-01: 장기 대기 → 미접수 → 전일 미완료 → 확인 필요). */
function buildCards(data: TodaySummary): UiCard[] {
  const cards: UiCard[] = []
  if (data.long_wait.length)
    cards.push({
      kind: 'longwait',
      title: '장기 대기',
      // [TODAY-ROW-01] 시각 레일 = 예약 시각(다른 카드와 같은 축). 대기 분은 우측 사유 「N분 대기」로만
      //   둔다(TODAY-WAIT-01) — 레일에도 분을 넣으면 같은 값이 두 번 나온다(L69). 당일 방문은 예약 시각이
      //   없어(슬롯 없음) 레일에 「당일」을 둔다.
      rows: data.long_wait.map((r) => ({ ...baseRow(r), rail: r.slot_time ? hhmm(r.slot_time) : '당일', railPast: false, reason: `${r.wait_minutes}분 대기` })),
    })
  if (data.not_arrived.length)
    cards.push({
      // TODAY-NOSHOW-01: 제목은 「미접수 · 시각 경과」(무책망 — '안 옴'이 아니라 '체크인 안 됨').
      kind: 'noshow',
      title: '미접수 · 시각 경과',
      rows: data.not_arrived.map((r) => ({ ...baseRow(r), rail: hhmm(r.slot_time), railPast: true })),
    })
  if (data.yesterday_unfinished.length) {
    // [TODAY-YDAY-03 개정 2026-08-30] 날짜를 행마다 반복하지 않는다 — 전부 같은 날이면 카드 머리에 한 번만 보이고,
    //   여러 지난 날(밀린 건)이 섞였을 때만 그 구분을 위해 행에 날짜를 단다. (서버는 slot_date < 오늘 = 여러 날 가능)
    const distinctDates = [...new Set(data.yesterday_unfinished.map((r) => r.slot_date))]
    const singleDay = distinctDates.length === 1
    cards.push({
      kind: 'yday',
      title: '전일 미완료',
      headerNote: singleDay ? md(distinctDates[0]) : undefined,
      rows: data.yesterday_unfinished.map((r) => ({ ...baseRow(r), rail: hhmm(r.slot_time), railDate: singleDay ? undefined : md(r.slot_date), railPast: true, reason: r.reason, slotLabel: `${md(r.slot_date)} ${hhmm(r.slot_time)}`, updatedAt: r.updated_at })),
    })
  }
  if (data.needs_attention.length)
    cards.push({
      kind: 'needs',
      title: '확인 필요한 예약',
      rows: data.needs_attention.map((r) => ({ ...baseRow(r), rail: '상담', railPast: false, reason: r.reason })),
    })
  // [TODAY-CONFIRM-01] 확정 대기 예약(자동확정 OFF에서 들어온 '예약신청'). 로비에서 실제로 기다리는
  //   환자(장기 대기·미접수)보다 덜 급하므로 맨 끝에 둔다. 미래 날짜라 날짜별 묶음으로 보인다(가까운 순).
  //   행은 시각만(날짜는 묶음 머리글이 진다), 확정 시 낙관적 잠금 열쇠로 updated_at을 싣는다.
  if (data.pending_confirmations.length)
    cards.push({
      kind: 'pending',
      title: '확정 대기 예약',
      rows: data.pending_confirmations.map((r) => ({
        ...baseRow(r), rail: hhmm(r.slot_time), railPast: false, slotDate: r.slot_date, updatedAt: r.updated_at,
      })),
    })
  return cards
}

// [TODAY-CONFIRM-02] 확정 대기 날짜 묶음 머리글의 요일(현지 파싱으로 UTC 경계 어긋남 방지).
const _WD = ['일', '월', '화', '수', '목', '금', '토']
function weekdayKo(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return _WD[new Date(y, m - 1, d).getDay()]
}

/** 작은 버튼 — 데모 공통 스타일(딥틸 꽉 참=그 자리 완결 / 흰 테두리=다른 화면).
 *  variant='detail' = [환자 상세] 전용(사용자 지시 2026-08-30) — 상태 처리 버튼(진료 대기·도착·되돌리기…)과
 *  한 줄에 섞이므로, 외곽선 + 사람 아이콘으로 늘 같은 모습을 유지해 '이 환자 기록 열기'임을 한눈에 구분한다. */
function Btn({
  children,
  variant = 'ghost',
  onClick,
}: {
  children: React.ReactNode
  variant?: 'primary' | 'outline' | 'ghost' | 'detail'
  onClick?: () => void
}) {
  const base = 'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors'
  const styles = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    outline: 'border border-border bg-card hover:bg-muted',
    ghost: 'text-primary hover:bg-primary/8',
    detail: 'border border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted',
  }[variant]
  return (
    <button onClick={onClick} className={`${base} ${styles}`}>
      {variant === 'detail' && <UserRound width={15} height={15} aria-hidden="true" className="-ml-0.5 text-muted-foreground" />}
      {children}
    </button>
  )
}

function RowButtons({ kind, row, navigate, onReveal, onCloseStale, onConfirm }: { kind: CardKind; row: UiRow; navigate: NavigateFunction; onReveal: () => void; onCloseStale: () => void; onConfirm: () => void }) {
  switch (kind) {
    case 'pending':
      // TODAY-CONFIRM-01: 주 동작은 [예약 확정] 하나만 또렷이. 거절(병원취소)은 되돌릴 수 없어
      //   ⋯ 메뉴 안에 숨긴다(다음 슬라이스). 상세는 이름·생년월일 클릭(TODAY-DETAIL-01).
      return (
        <Btn variant="primary" onClick={onConfirm}>예약 확정</Btn>
      )
    case 'longwait':
      // TODAY-BTN-01: [진료 시작]을 두지 않는다 — 순서 조정만. 상세는 이름·생년월일 클릭(TODAY-DETAIL-01).
      return (
        <Btn variant="outline" onClick={() => navigate('/queue?tab=waiting')}>대기 목록에서 보기</Btn>
      )
    case 'noshow':
      // TODAY-BTN-02: [진료 대기]·[도착] 두 갈래(/queue 미도착 줄과 같다). TODAY-BTN-05: [번호 보기]는 인라인(MASK-VIEW-01).
      return (
        <>
          <Btn variant="primary" onClick={() => navigate(`/queue?tab=not_arrived&appointment=${row.appointmentId}&action=waiting`)}>진료 대기</Btn>
          <Btn variant="outline" onClick={() => navigate(`/queue?tab=not_arrived&appointment=${row.appointmentId}&action=arrive`)}>도착</Btn>
          <Btn onClick={onReveal}>번호 보기</Btn>
        </>
      )
    case 'yday':
      // TODAY-YDAY-04: 사람이 닫는 창구 — [마감 처리] → 확인창에서 완료/취소를 고른다.
      //   상세는 이름·생년월일 클릭(TODAY-DETAIL-01, 옛 [환자 상세] 버튼 갈음).
      return (
        <Btn variant="primary" onClick={onCloseStale}>마감 처리</Btn>
      )
    case 'needs':
      // TODAY-RESCHED-24/25: 버튼 하나 — 해당 예약이 선택된 캘린더로(옮기기·취소 도장은 여기서 안 찍는다).
      return (
        <Btn variant="primary" onClick={() => navigate(`/calendar?appointment=${row.appointmentId}`)}>예약·상담 보기</Btn>
      )
  }
}

function Row({ kind, row, navigate, onConfirm }: { kind: CardKind; row: UiRow; navigate: NavigateFunction; onConfirm?: (row: UiRow) => void }) {
  // 번호 보기 = 그 줄에서 원문이 펼쳐지고 [복사]가 함께 뜬다(MASK-VIEW-01). revealContact가 열람 기록을 남긴다(MASK-VIEW-02).
  const [phone, setPhone] = useState<string | null>(null)
  const [closing, setClosing] = useState(false) // [TODAY-YDAY-04] 마감 확인창
  const reveal = async () => {
    try {
      const c = await revealContact(row.patientId)
      setPhone((c.phone as string) ?? null)
    } catch {
      /* 조회 실패는 조용히 — 행 전체를 무너뜨리지 않는다 */
    }
  }
  // [TODAY-DETAIL-01] 환자 상세로 — 별도 [환자 상세] 버튼 대신 이름·생년월일을 눌러 연다(2026-09-13).
  const goDetail = () => navigate(`/patients/${row.patientId}`)

  return (
    <div data-testid={`${kind}-row-${row.appointmentId}`} className="flex items-center gap-4 px-4 py-2.5">
      {/* 시각 레일(TODAY-ROW-01 시그니처) — 미접수·전일은 옅은 회색(TODAY-ROW-02). */}
      {/* [L23][TODAY-YDAY-03] 지난 날짜 행은 날짜+시각을 함께 보인다 — 좁은 레일에서 못나게 접히지 않도록
          그 행만 레일 폭을 넓혀 「8/29 09:30」을 한 줄로(날짜 작게·시각 굵게). 시각만인 행은 종전 폭 그대로. */}
      <div className={`flex ${row.railDate ? 'w-[88px]' : 'w-14'} shrink-0 flex-col items-end border-r border-border pr-3`}>
        <span className="whitespace-nowrap tabular-nums">
          {row.railDate && <span className="mr-1 text-xs text-muted-foreground/60">{row.railDate}</span>}
          <span className={`text-sm font-semibold ${row.railPast ? 'text-muted-foreground/60' : 'text-foreground'}`}>{row.rail}</span>
        </span>
      </div>

      {/* 이름 · 생년월일 · 과/의사를 한 줄로(SEARCH-RESULT-09 패턴 · 번호 보기 인라인).
          [TODAY-LAY-02] 카드를 넓혀도 창이 극단적으로 좁으면 자리가 모자랄 수 있어 — 줄바꿈(못난 2줄) 대신
          이름은 그대로 두고 뒤 정보만 「…」로 자른다(넉넉한 폭에선 …가 나타나지 않음). */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-x-2">
          {/* [TODAY-DETAIL-01] 이름·생년월일을 누르면 환자 상세로(호버 밑줄). 옛 variant='detail' [환자 상세]
              버튼을 갈음한다(2026-09-13, ~~사용자 지시 2026-08-30의 전용 버튼~~ → 텍스트 클릭으로 통일).
              번호 보기로 전화가 펼쳐진 동안은 그 자리가 전화+복사이므로 이름만 누를 수 있다. */}
          <button
            type="button"
            onClick={goDetail}
            title="환자 상세 보기"
            className="shrink-0 cursor-pointer whitespace-nowrap font-bold hover:underline focus-visible:underline"
          >
            {row.name}
          </button>
          <span className="min-w-0 truncate text-sm text-muted-foreground">
            {phone ? (
              <span className="font-medium text-foreground">{phone}</span>
            ) : (
              <button
                type="button"
                onClick={goDetail}
                title="환자 상세 보기"
                className="cursor-pointer hover:underline focus-visible:underline"
              >
                {row.maskedBirth}
              </button>
            )}
            {(row.dept || row.doctor) && (
              <>
                {' · '}
                {row.dept} {row.doctor}
              </>
            )}
          </span>
          {phone && (
            <button onClick={() => navigator.clipboard?.writeText(phone)} className="shrink-0 text-xs font-medium text-primary hover:underline">
              복사
            </button>
          )}
        </div>
      </div>

      {/* 사유(주의색) — [TODAY-YDAY-05] 오른쪽 정렬로 버튼에 붙여 상태글자↔버튼 간격을 좁힌다
          (전일 미완료 [마감 처리]와의 간격을 「확인 필요한 예약」 수준으로, 2026-09-13). */}
      {row.reason && <div className="hidden w-40 shrink-0 text-right text-sm font-medium text-amber-600 sm:block">{row.reason}</div>}

      {/* 버튼 */}
      <div className="flex shrink-0 items-center gap-2">
        <RowButtons kind={kind} row={row} navigate={navigate} onReveal={reveal} onCloseStale={() => setClosing(true)} onConfirm={() => onConfirm?.(row)} />
      </div>

      {closing && <CloseStaleDialog row={row} onClose={() => setClosing(false)} />}
    </div>
  )
}

/** [TODAY-YDAY-04] 전일 미완료 마감 — 진료가 있었는지는 사람이 판단하므로 완료/취소를 고르게 한다.
 *  되돌릴 수 없는 마감이라 확인창 안에서만 고른다(취소=빨간 동작). */
function CloseStaleDialog({ row, onClose }: { row: UiRow; onClose: () => void }) {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: (outcome: 'completed' | 'cancelled') =>
      closeStaleAppointment(row.appointmentId, { outcome, expected_updated_at: row.updatedAt ?? '' }),
    onSuccess: () => {
      // 마감되면 이 행이 목록에서 사라지도록 오늘 요약을 다시 읽는다.
      void qc.invalidateQueries({ queryKey: ['today-summary'] })
      onClose()
    },
    onError: (e) => setError(e instanceof Error ? e.message : '마감하지 못했습니다. 잠시 후 다시 시도하세요.'),
  })
  const busy = mutation.isPending
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/20 px-4" role="dialog" aria-modal="true" aria-label="전일 미완료 마감">
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-bold">이 예약을 어떻게 마감할까요?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{row.name}</span>
          {row.slotLabel && <> · {row.slotLabel}</>}
        </p>
        <p className="mt-3 text-sm">
          진료가 실제로 있었나요? <span className="text-muted-foreground">마감하면 되돌릴 수 없습니다.</span>
        </p>
        {error && <p role="alert" className="mt-2 text-sm font-medium text-destructive">{error}</p>}
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={() => mutation.mutate('completed')}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            진료 완료로 마감
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => mutation.mutate('cancelled')}
            className="rounded-lg border border-destructive/40 bg-card px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50"
          >
            진료 없이 취소로 마감
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

/** [TODAY-CONFIRM-02] 확정 대기는 날짜별 머리글로 묶어 전부 펼친다(가까운 순으로 이미 정렬돼 옴).
 *  머리글은 날짜가 바뀔 때만 낀다 — 같은 날 여러 건이면 한 번만 보인다. */
function groupByDate(rows: UiRow[]): { date: string; rows: UiRow[] }[] {
  const groups: { date: string; rows: UiRow[] }[] = []
  for (const r of rows) {
    const date = r.slotDate ?? ''
    const last = groups[groups.length - 1]
    if (last && last.date === date) last.rows.push(r)
    else groups.push({ date, rows: [r] })
  }
  return groups
}

function ProblemCardView({ card, navigate, onConfirm }: { card: UiCard; navigate: NavigateFunction; onConfirm?: (row: UiRow) => void }) {
  const isPending = card.kind === 'pending'
  return (
    <section id={`today-card-${card.kind}`} className="mb-3 break-inside-avoid overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)] scroll-mt-4">
      {/* TODAY-CARD-01: 좌측 주의색 바 + 건수(배경 안 칠함). 확정 대기는 청록 바(신규·처리형). */}
      <div data-testid={`card-header-${card.kind}`} className="flex items-center gap-3 border-b border-border/70 px-4 py-2.5">
        <span className={`h-4 w-1 rounded-full ${isPending ? 'bg-primary' : 'bg-amber-500'}`} />
        <h3 className="text-sm font-semibold">{card.title}</h3>
        {/* 전일 미완료가 전부 같은 날이면 그 날짜를 머리에 한 번만(TODAY-YDAY-03). 행마다 반복하지 않는다.
            ⭐ 어느 날 건지 한눈에 들어오도록 배지로(사용자 지시 2026-08-30 — 더 잘 보이게). */}
        {card.headerNote && <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums text-foreground">{card.headerNote}</span>}
        <span className={`text-sm font-bold tabular-nums ${isPending ? 'text-primary' : 'text-amber-600'}`}>{card.rows.length}</span>
      </div>
      {isPending ? (
        // [TODAY-CONFIRM-02] 날짜별 묶음 머리글 + 그 날의 행들(전부 펼침).
        <div>
          {groupByDate(card.rows).map((g) => (
            <div key={g.date}>
              <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-1.5">
                <span className="text-sm font-bold tabular-nums">{md(g.date)}</span>
                <span className="text-xs text-muted-foreground">({weekdayKo(g.date)})</span>
                <span className="text-xs text-muted-foreground">· {g.rows.length}건</span>
              </div>
              <div className="divide-y divide-border/60">
                {g.rows.map((r) => (
                  <Row key={r.appointmentId} kind={card.kind} row={r} navigate={navigate} onConfirm={onConfirm} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {card.rows.map((r) => (
            <Row key={r.appointmentId} kind={card.kind} row={r} navigate={navigate} />
          ))}
        </div>
      )}
    </section>
  )
}

// 요약 타일 6종 (TODAY-SUM-03: 전부 /queue 해당 탭으로).
const TILE_SPECS: { key: keyof TodaySummary['tiles']; label: string; tab: string; tone: string }[] = [
  { key: 'total_reserved', label: '전체 예약', tab: 'total', tone: 'text-foreground' },
  { key: 'arrived', label: '도착', tab: 'arrived', tone: 'text-violet-600' },
  { key: 'waiting', label: '진료 대기', tab: 'waiting', tone: 'text-sky-600' },
  { key: 'in_progress', label: '진료 중', tab: 'in_progress', tone: 'text-primary' },
  { key: 'completed', label: '진료 완료', tab: 'completed', tone: 'text-slate-500' },
  { key: 'cancelled_or_noshow', label: '취소·부도', tab: 'cancelled_or_noshow', tone: 'text-amber-600' },
]

function TodayBody({ data, navigate }: { data: TodaySummary; navigate: NavigateFunction }) {
  const cards = buildCards(data)
  const total = data.long_wait.length + data.not_arrived.length + data.yesterday_unfinished.length + data.needs_attention.length + data.pending_confirmations.length
  const scrollToCard = (kind: string) =>
    document.getElementById(`today-card-${kind}`)?.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'start' })

  // [TODAY-CONFIRM-01] 확정 대기 [예약 확정] = '예약신청'→'예약확정' 전이(기존 transitionStatus 재사용).
  //   updated_at을 낙관적 잠금 열쇠로 싣는다. 성공하면 요약을 다시 불러 목록에서 빠진다.
  const qc = useQueryClient()
  const confirmMut = useMutation({
    mutationFn: (row: UiRow) =>
      transitionStatus(row.appointmentId, { new_status: '예약확정', expected_updated_at: row.updatedAt ?? '' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['today-summary'] }),
  })
  const onConfirm = (row: UiRow) => confirmMut.mutate(row)

  // [TODAY-LAY-04] 카드 열 수(1/2) — 직원이 모니터에 맞춰 고르고 localStorage에 기억한다(best-effort).
  //   저장 실패(사생활 모드·목)는 조용히 넘기고 기본 1열로 둔다.
  const [cols, setColsState] = useState<1 | 2>(() => {
    try { return localStorage.getItem('today_cols') === '2' ? 2 : 1 } catch { return 1 }
  })
  const setCols = (n: 1 | 2) => {
    setColsState(n)
    try { localStorage.setItem('today_cols', String(n)) } catch { /* best-effort */ }
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* ── 요약 레일: 왼쪽 고정 (사용자 결정 2026-09-15 — ~~E-6에서 오른쪽 승인~~을 왼쪽으로 뒤집음).
          [TODAY-LAY-05] 전역 메뉴 옆에서 요약을 먼저 읽게 한다. [TODAY-LAY-02] 레일 224px(긴 진료과도 안 접힘). */}
      <aside data-testid="today-rail" className="flex w-full shrink-0 flex-col gap-4 lg:sticky lg:top-5 lg:w-56">
        {/* 지금 처리할 것 — 숫자 버튼(누르면 해당 카드로 점프). */}
        {total > 0 && (
          <div className="rounded-xl border border-border/70 bg-card p-3 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
            <h3 className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              지금 처리할 것
              <span data-testid="processing-total" className="rounded-full bg-amber-500/12 px-1.5 py-0.5 text-[0.7rem] font-bold text-amber-700 tabular-nums">{total}</span>
            </h3>
            <div className="flex flex-col gap-0.5">
              {cards.map((c) => (
                <button
                  key={c.kind}
                  onClick={() => scrollToCard(c.kind)}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                >
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {c.title}
                  </span>
                  <span className="font-bold tabular-nums text-amber-600">{c.rows.length}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 오늘 요약 6타일 (전부 /queue 해당 탭, TODAY-SUM-03) */}
        <div className="rounded-xl border border-border/70 bg-card p-3 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">오늘 요약</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
            {TILE_SPECS.map((t) => (
              <button
                key={t.key}
                aria-label={`${t.label} ${data.tiles[t.key]}건`}
                onClick={() => navigate(`/queue?tab=${t.tab}`)}
                className="rounded-lg border border-border/70 bg-card px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
              >
                <div className={`text-xl font-bold tabular-nums ${t.tone}`}>{data.tiles[t.key]}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{t.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 의사별 대기 인원 (TODAY-DOC-01: 진료과 생략 안 함, 동명 방지) */}
        {data.doctor_waiting.length > 0 && (
          <div className="rounded-xl border border-border/70 bg-card p-3 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
            <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">의사별 대기 인원</h3>
            <div className="flex flex-col gap-0.5">
              {data.doctor_waiting.map((d) => (
                <button
                  key={d.doctor_id}
                  data-testid={`doc-waiting-${d.doctor_id}`}
                  onClick={() => navigate('/queue?tab=waiting')}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span>
                    <span className="text-muted-foreground">{d.department_name}</span> {d.doctor_name}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {d.waiting_count}
                    <span className="ml-0.5 text-sm font-normal text-muted-foreground">명</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* [TODAY-DOC-01] 우측열은 데모 원형대로 「의사별 대기 인원」으로 끝난다. 옛 「확인 필요 상담 문의」(2026-09-09)는
            제거 — 사이드바 「상담봇 문의함」 배지(TICKET-BADGE-01)가 같은 pending 수·같은 목적지(/tickets)라 중복이었다(2026-09-11 사용자 결정). */}
      </aside>

      {/* ── 주 컬럼: 지금 처리할 것 (TODAY-LAY-01·ORDER-02, 전부 표시) ── */}
      <div className="min-w-0 flex-1">
        {/* [TODAY-LAY-04] 1열/2열 토글 — 직원이 모니터에 맞춰 고른다(넓으면 2열로 더 많이, 좁으면 1열). */}
        {total > 0 && (
          <div className="mb-3 flex items-center justify-end">
            <div className="inline-flex overflow-hidden rounded-lg border border-border">
              {([1, 2] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setCols(n)}
                  aria-pressed={cols === n}
                  className={`px-3 py-1 text-sm ${cols === n ? 'bg-primary font-semibold text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'} ${n === 2 ? 'border-l border-border' : ''}`}
                >
                  {n}열
                </button>
              ))}
            </div>
          </div>
        )}
        {total === 0 ? (
          // TODAY-EMPTY-01: 사실 문장 + 안내. TODAY-EMPTY-02: [다시 시도] 없음(실패가 아니다).
          <div className="flex flex-col items-center">
            <EmptyState kind="zero" message="지금 처리할 일이 없습니다" />
            <p className="mt-0.5 text-sm text-muted-foreground">새 문제가 생기면 여기에 바로 나타납니다</p>
          </div>
        ) : (
          // [TODAY-LAY-04] 2열은 CSS 다단(넓은 xl↑에서만 — 좁으면 자동 1단으로 접혀 잘림을 막는다).
          //   카드는 break-inside-avoid라 단 사이에서 쪼개지지 않는다.
          <div data-testid="today-cards" data-cols={cols} className={cols === 2 ? 'columns-1 [column-gap:0.75rem] xl:columns-2' : ''}>
            {cards.map((c) => (
              <ProblemCardView key={c.kind} card={c} navigate={navigate} onConfirm={onConfirm} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function Today() {
  const navigate = useNavigate()
  const query = useQuery({ queryKey: ['today-summary'], queryFn: getTodaySummary })

  return (
    <StaffPage testid="today">

      {query.isPending && <LoadingState message="오늘의 현황을 불러오는 중입니다" />}

      {/* 조회 실패는 사실이 아니라 실패라 [다시 시도]를 준다(ERR-RETRY-02). */}
      {query.isError && <EmptyState kind="error" onRetry={() => query.refetch()} />}

      {query.data && <TodayBody data={query.data} navigate={navigate} />}
    </StaffPage>
  )
}
