import { useState } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { StaffPage } from '../../components/staff-ui'
import { EmptyState } from '../../components/EmptyState'
import {
  getTodaySummary,
  type TodaySummary,
  type PatientRow,
} from '../../api/dashboard'
import { revealContact } from '../../api/patients'
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

type CardKind = 'longwait' | 'noshow' | 'yday' | 'needs'

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
}
interface UiCard {
  kind: CardKind
  title: string
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
      rows: data.long_wait.map((r) => ({ ...baseRow(r), rail: `${r.wait_minutes}′`, railPast: false, reason: `${r.wait_minutes}분 대기` })),
    })
  if (data.not_arrived.length)
    cards.push({
      // TODAY-NOSHOW-01: 제목은 「미접수 · 시각 경과」(무책망 — '안 옴'이 아니라 '체크인 안 됨').
      kind: 'noshow',
      title: '미접수 · 시각 경과',
      rows: data.not_arrived.map((r) => ({ ...baseRow(r), rail: hhmm(r.slot_time), railPast: true })),
    })
  if (data.yesterday_unfinished.length)
    cards.push({
      kind: 'yday',
      title: '전일 미완료',
      rows: data.yesterday_unfinished.map((r) => ({ ...baseRow(r), rail: hhmm(r.slot_time), railDate: md(r.slot_date), railPast: true, reason: r.reason })),
    })
  if (data.needs_attention.length)
    cards.push({
      kind: 'needs',
      title: '확인 필요한 예약',
      rows: data.needs_attention.map((r) => ({ ...baseRow(r), rail: '상담', railPast: false, reason: r.reason })),
    })
  return cards
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

function RowButtons({ kind, row, navigate, onReveal }: { kind: CardKind; row: UiRow; navigate: NavigateFunction; onReveal: () => void }) {
  switch (kind) {
    case 'longwait':
      // TODAY-BTN-01: [진료 시작]을 두지 않는다 — 순서 조정과 상세 보기만.
      return (
        <>
          <Btn variant="outline" onClick={() => navigate('/queue?tab=waiting')}>대기 목록에서 보기</Btn>
          <Btn variant="detail" onClick={() => navigate(`/patients/${row.patientId}`)}>환자 상세</Btn>
        </>
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
      return <Btn variant="detail" onClick={() => navigate(`/patients/${row.patientId}`)}>환자 상세</Btn>
    case 'needs':
      // TODAY-RESCHED-24/25: 버튼 하나 — 해당 예약이 선택된 캘린더로(옮기기·취소 도장은 여기서 안 찍는다).
      return (
        <Btn variant="primary" onClick={() => navigate(`/calendar?appointment=${row.appointmentId}`)}>예약·상담 보기</Btn>
      )
  }
}

function Row({ kind, row, navigate }: { kind: CardKind; row: UiRow; navigate: NavigateFunction }) {
  // 번호 보기 = 그 줄에서 원문이 펼쳐지고 [복사]가 함께 뜬다(MASK-VIEW-01). revealContact가 열람 기록을 남긴다(MASK-VIEW-02).
  const [phone, setPhone] = useState<string | null>(null)
  const reveal = async () => {
    try {
      const c = await revealContact(row.patientId)
      setPhone((c.phone as string) ?? null)
    } catch {
      /* 조회 실패는 조용히 — 행 전체를 무너뜨리지 않는다 */
    }
  }

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

      {/* 이름 · 생년월일 · 과/의사를 한 줄로(SEARCH-RESULT-09 패턴 · 번호 보기 인라인) */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-bold">{row.name}</span>
          <span className="text-sm text-muted-foreground">
            {phone ? <span className="font-medium text-foreground">{phone}</span> : row.maskedBirth}
            {(row.dept || row.doctor) && (
              <>
                {' · '}
                {row.dept} {row.doctor}
              </>
            )}
          </span>
          {phone && (
            <button onClick={() => navigator.clipboard?.writeText(phone)} className="text-xs font-medium text-primary hover:underline">
              복사
            </button>
          )}
        </div>
      </div>

      {/* 사유(주의색) */}
      {row.reason && <div className="hidden w-40 shrink-0 text-sm font-medium text-amber-600 sm:block">{row.reason}</div>}

      {/* 버튼 */}
      <div className="flex shrink-0 items-center gap-2">
        <RowButtons kind={kind} row={row} navigate={navigate} onReveal={reveal} />
      </div>
    </div>
  )
}

function ProblemCardView({ card, navigate }: { card: UiCard; navigate: NavigateFunction }) {
  return (
    <section id={`today-card-${card.kind}`} className="scroll-mt-4 overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
      {/* TODAY-CARD-01: 좌측 주의색 바 + 건수(배경 안 칠함). */}
      <div data-testid={`card-header-${card.kind}`} className="flex items-center gap-3 border-b border-border/70 px-4 py-2.5">
        <span className="h-4 w-1 rounded-full bg-amber-500" />
        <h3 className="text-sm font-semibold">{card.title}</h3>
        <span className="text-sm font-bold tabular-nums text-amber-600">{card.rows.length}</span>
      </div>
      <div className="divide-y divide-border/60">
        {card.rows.map((r) => (
          <Row key={r.appointmentId} kind={card.kind} row={r} navigate={navigate} />
        ))}
      </div>
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
  const total = data.long_wait.length + data.not_arrived.length + data.yesterday_unfinished.length + data.needs_attention.length
  const scrollToCard = (kind: string) =>
    document.getElementById(`today-card-${kind}`)?.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'start' })

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* ── 주 컬럼: 지금 처리할 것 (TODAY-LAY-01·ORDER-02, 전부 표시) ── */}
      <div className="min-w-0 flex-1">
        {total === 0 ? (
          // TODAY-EMPTY-01: 사실 문장 + 안내. TODAY-EMPTY-02: [다시 시도] 없음(실패가 아니다).
          <div className="flex flex-col items-center">
            <EmptyState kind="zero" message="지금 처리할 일이 없습니다" />
            <p className="mt-0.5 text-sm text-muted-foreground">새 문제가 생기면 여기에 바로 나타납니다</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {cards.map((c) => (
              <ProblemCardView key={c.kind} card={c} navigate={navigate} />
            ))}
          </div>
        )}
      </div>

      {/* ── 오른쪽 사이드 레일 (넓은 화면에서 따라 붙음, 좁으면 아래로 스택) ── */}
      <aside className="flex w-full shrink-0 flex-col gap-4 lg:sticky lg:top-5 lg:w-72">
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

        {/* 확인 필요 상담 문의 — 4단계 집계 계약이 없으면 「집계 불가」(STAT-METRIC-06: 0이 아니다). */}
        <div className="flex items-baseline gap-2 px-1 text-sm">
          <span className="font-semibold text-muted-foreground">확인 필요 상담 문의</span>
          {data.bot_pending === null ? (
            <span className="text-muted-foreground/60">현재 집계할 수 없음</span>
          ) : (
            <span data-testid="bot-pending" className="font-bold tabular-nums text-foreground">{data.bot_pending}</span>
          )}
        </div>
      </aside>
    </div>
  )
}

export function Today() {
  const navigate = useNavigate()
  const query = useQuery({ queryKey: ['today-summary'], queryFn: getTodaySummary })

  return (
    <StaffPage testid="today">

      {query.isPending && <p role="status" className="text-muted-foreground">오늘의 현황을 불러오는 중입니다</p>}

      {/* 조회 실패는 사실이 아니라 실패라 [다시 시도]를 준다(ERR-RETRY-02). */}
      {query.isError && <EmptyState kind="error" onRetry={() => query.refetch()} />}

      {query.data && <TodayBody data={query.data} navigate={navigate} />}
    </StaffPage>
  )
}
