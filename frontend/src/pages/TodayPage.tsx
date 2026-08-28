import type { CSSProperties, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { StatTile } from '../components/StatTile'
import {
  getTodaySummary,
  type DoctorWaitingRow,
  type LongWaitRow,
  type NeedsAttentionRow,
  type NotArrivedRow,
  type PatientRow,
  type TodaySummary,
  type YesterdayUnfinishedRow,
} from '../api/dashboard'

/**
 * 오늘의 현황 `/today` — 접수직원·관리자의 랜딩(ROLE: RECEPTION_AND_ADMIN, route guard가 이미 막는다).
 *
 * ⭐ 화면 규칙은 「지금 처리할 것」을 먼저, 숫자 타일을 아래로 둔다(TODAY-LAY-01) — 요구사항 3.2가
 *    *"숫자만 보여주는 화면보다 지금 처리해야 할 환자와 문제가 먼저"*.
 *
 * 이 화면은 `/today/summary` 한 응답만 소비한다(SHELL-LIVE-01·03 — 나눠 부르면 사이드바 숫자와
 * 카드가 다른 시점을 말한다). 「지금 처리할 것」은 고정 순서(TODAY-ORDER-01): 장기 대기 → 미접수·시각
 * 경과 → 전일 미완료 → 확인 필요한 예약. 「오늘 요약」에는 타일 6개 + 의사별 대기(TODAY-DOC-01)를 둔다.
 * ⛔ 일정변경 영향 예약(TODAY-RESCHED-01~22)·실시간(TODAY-LIVE)은 별도 데이터가 필요해 여기서 그리지 않는다.
 */
export function TodayPage() {
  const navigate = useNavigate()
  const query = useQuery({ queryKey: ['today-summary'], queryFn: getTodaySummary })

  return (
    <section aria-label="오늘의 현황" style={styles.page}>
      <div data-testid="today-date" style={styles.date}>{todayLabel()}</div>

      {query.isPending && <p role="status" style={styles.loading}>오늘의 현황을 불러오는 중입니다</p>}

      {query.isError && (
        // 조회 실패는 사실이 아니라 실패라 [다시 시도]를 준다(ERR-RETRY-02).
        <EmptyState kind="error" onRetry={() => query.refetch()} />
      )}

      {query.data && <TodayBody data={query.data} navigate={navigate} />}
    </section>
  )
}

function TodayBody({ data, navigate }: { data: TodaySummary; navigate: (to: string) => void }) {
  // TODAY-LAY-03: 총계는 「지금 처리할 것」에 보이는 네 카드의 합이다.
  const processingCount =
    data.long_wait.length + data.not_arrived.length +
    data.yesterday_unfinished.length + data.needs_attention.length

  return (
    <>
      {/* ── 지금 처리할 것 (TODAY-LAY-01: 맨 위) ───────────────────────────── */}
      <section aria-label="지금 처리할 것" style={styles.block}>
        <div style={styles.blockHead}>
          <h2 style={styles.h2}>지금 처리할 것</h2>
          {/* TODAY-LAY-03: 처리할 것 ≥1건이면 총계를 주의색으로. */}
          {processingCount > 0 && (
            <span data-testid="processing-total" style={styles.total}>{processingCount}</span>
          )}
        </div>

        {processingCount === 0 ? (
          // TODAY-EMPTY-01: 사실 문장 + 안내 문장. TODAY-EMPTY-02: [다시 시도] 없음(실패가 아니다).
          <div style={styles.emptyWrap}>
            <EmptyState kind="zero" message="지금 처리할 일이 없습니다" />
            <p style={styles.emptyHint}>새 문제가 생기면 여기에 바로 나타납니다</p>
          </div>
        ) : (
          // TODAY-ORDER-01: 장기 대기 → 미접수 → 전일 미완료 → 확인 필요(지금 병원에 있는 사람이 먼저).
          <div style={styles.cards}>
            {data.long_wait.length > 0 && (
              <Card id="longwait" title="장기 대기" count={data.long_wait.length}>
                {data.long_wait.map((row) => (
                  <LongWaitRowView key={row.appointment_id} row={row} navigate={navigate} />
                ))}
              </Card>
            )}
            {data.not_arrived.length > 0 && (
              // TODAY-NOSHOW-01: 제목은 「미접수 · 시각 경과」(무책망 — '안 옴'이 아니라 '체크인 안 됨').
              <Card id="noshow" title="미접수 · 시각 경과" count={data.not_arrived.length}>
                {data.not_arrived.map((row) => (
                  <NotArrivedRowView key={row.appointment_id} row={row} navigate={navigate} />
                ))}
              </Card>
            )}
            {data.yesterday_unfinished.length > 0 && (
              <Card id="yday" title="전일 미완료" count={data.yesterday_unfinished.length}>
                {data.yesterday_unfinished.map((row) => (
                  <YesterdayRowView key={row.appointment_id} row={row} navigate={navigate} />
                ))}
              </Card>
            )}
            {data.needs_attention.length > 0 && (
              <Card id="needs" title="확인 필요한 예약" count={data.needs_attention.length}>
                {data.needs_attention.map((row) => (
                  <NeedsRowView key={row.appointment_id} row={row} navigate={navigate} />
                ))}
              </Card>
            )}
          </div>
        )}
      </section>

      {/* ── 오늘 요약 (TODAY-SUM-01: 처리할 것 아래) ───────────────────────── */}
      <section aria-label="오늘 요약" style={styles.block}>
        <h2 style={styles.h2}>오늘 요약</h2>
        <div style={styles.tiles}>
          {TILE_SPECS.map((spec) => (
            <TileButton
              key={spec.key}
              label={spec.label}
              value={data.tiles[spec.key]}
              tone={spec.tone}
              // TODAY-SUM-03: 여섯 타일 전부 그 상태 탭이 눌린 /queue로 간다(TODAY-SUM-04: 캘린더 아님).
              onClick={() => navigate(`/queue?tab=${spec.tab}`)}
            />
          ))}
        </div>

        {/* TODAY-DOC-01: 의사별 대기 인원 — 진료과+의사 이름과 대기 수(진료과 생략 안 함, 동명 방지). */}
        {data.doctor_waiting.length > 0 && (
          <div style={styles.docWaitWrap}>
            <span style={styles.docWaitHead}>의사별 대기</span>
            <div style={styles.docWaitList}>
              {data.doctor_waiting.map((doc) => (
                <DoctorWaitingView key={doc.doctor_id} doc={doc} />
              ))}
            </div>
          </div>
        )}

        {/* 확인 필요 상담 문의 — 4단계 집계 계약이 없으면 null(STAT-METRIC-06): 0이 아니라 「집계 불가」. */}
        <div style={styles.pendingLine}>
          <span style={styles.pendingLabel}>확인 필요 상담 문의</span>
          {data.bot_pending === null ? (
            <span style={styles.pendingUnknown}>현재 집계할 수 없음</span>
          ) : (
            <span data-testid="bot-pending" style={styles.pendingValue}>{data.bot_pending}</span>
          )}
        </div>
      </section>
    </>
  )
}

// ── 카드 ────────────────────────────────────────────────────────────────────

function Card({ id, title, count, children }: { id: string; title: string; count: number; children: ReactNode }) {
  return (
    <div style={styles.card}>
      {/* TODAY-CARD-01: 좌측 4px 주의색 바 + 주의색 건수. 배경은 칠하지 않는다(전면 배너만 예외). */}
      <div data-testid={`card-header-${id}`} style={styles.cardHead}>
        <span style={styles.cardTitle}>{title}</span>
        <span style={styles.cardCount}>{count}</span>
      </div>
      <div style={styles.rows}>{children}</div>
    </div>
  )
}

// ── 행 ──────────────────────────────────────────────────────────────────────

function LongWaitRowView({ row, navigate }: { row: LongWaitRow; navigate: (to: string) => void }) {
  return (
    <div data-testid={`longwait-row-${row.appointment_id}`} style={styles.row}>
      {/* 시각 레일(TODAY-ROW-01 시그니처) — 장기 대기는 대기 분을 레일에 세운다. */}
      <div style={styles.railWarn} aria-hidden="true">{row.wait_minutes}′</div>
      <Identity row={row} />
      <span style={styles.reasonWarn}>{row.wait_minutes}분 대기</span>
      {/* TODAY-BTN-01: [진료 시작]을 두지 않는다 — 순서 조정과 상세 보기만. */}
      <div style={styles.rowActions}>
        <button type="button" style={styles.btnQuiet} onClick={() => navigate('/queue?tab=waiting')}>
          대기 목록에서 보기
        </button>
        <button type="button" style={styles.btnQuiet} onClick={() => navigate(`/patients/${row.patient_id}`)}>
          환자 상세
        </button>
      </div>
    </div>
  )
}

function NotArrivedRowView({ row, navigate }: { row: NotArrivedRow; navigate: (to: string) => void }) {
  // TODAY-ROW-02: 아직 오지 않은 예약이라 시각 레일을 옅은 회색으로(진행 중과 구분).
  return (
    <div data-testid={`noshow-row-${row.appointment_id}`} style={styles.row}>
      <div style={styles.railPast} aria-hidden="true">{hhmm(row.slot_time)}</div>
      <Identity row={row} />
      <span style={styles.reason} />
      {/* TODAY-BTN-02: [진료 대기]·[도착] 두 갈래(/queue 미도착 줄과 같은 두 갈래). TODAY-BTN-05: [번호 보기]. */}
      <div style={styles.rowActions}>
        <button type="button" style={styles.btnPrimary}
          onClick={() => navigate(`/queue?tab=not_arrived&appointment=${row.appointment_id}&action=waiting`)}>
          진료 대기
        </button>
        <button type="button" style={styles.btnQuiet}
          onClick={() => navigate(`/queue?tab=not_arrived&appointment=${row.appointment_id}&action=arrive`)}>
          도착
        </button>
        {/* TODAY-BTN-05: 이름이 「전화 걸기」가 아니다 — 원문 공개(MASK-VIEW)는 환자 상세에서 이뤄진다. */}
        <button type="button" style={styles.btnQuiet} onClick={() => navigate(`/patients/${row.patient_id}`)}>
          번호 보기
        </button>
      </div>
    </div>
  )
}

function YesterdayRowView({ row, navigate }: { row: YesterdayUnfinishedRow; navigate: (to: string) => void }) {
  return (
    <div data-testid={`yday-row-${row.appointment_id}`} style={styles.row}>
      {/* TODAY-YDAY-03: 지난 날짜이므로 날짜를 함께 표시한다(8/2 16:30) — 오늘로 오해하지 않게. */}
      <div style={styles.railPast} aria-hidden="true">{mdHm(row.slot_date, row.slot_time)}</div>
      <Identity row={row} />
      <span style={styles.reason}>{row.reason}</span>
      <div style={styles.rowActions}>
        <button type="button" style={styles.btnQuiet} onClick={() => navigate(`/patients/${row.patient_id}`)}>
          환자 상세
        </button>
      </div>
    </div>
  )
}

function DoctorWaitingView({ doc }: { doc: DoctorWaitingRow }) {
  return (
    <div data-testid={`doc-waiting-${doc.doctor_id}`} style={styles.docWaitRow}>
      {/* 진료과를 생략하지 않는다(동명 방지) — 「내과 · 박지훈」. */}
      <span style={styles.docWaitName}>{doc.department_name} · {doc.doctor_name}</span>
      <span style={styles.docWaitCount}>{doc.waiting_count}명</span>
    </div>
  )
}

function NeedsRowView({ row, navigate }: { row: NeedsAttentionRow; navigate: (to: string) => void }) {
  return (
    <div data-testid={`needs-row-${row.appointment_id}`} style={styles.row}>
      <div style={styles.railWarn} aria-hidden="true">상담</div>
      <Identity row={row} />
      <span style={styles.reason}>{row.reason}</span>
      {/* TODAY-RESCHED-24: 버튼은 하나. 여기서 옮기기·취소 도장을 찍지 않는다(상담이라 답변이 함께 있다). */}
      <div style={styles.rowActions}>
        {/* TODAY-RESCHED-25: 해당 예약이 선택된 캘린더로 이동한다. */}
        <button type="button" style={styles.btnPrimary} onClick={() => navigate(`/calendar?appointment=${row.appointment_id}`)}>
          예약·상담 보기
        </button>
      </div>
    </div>
  )
}

function Identity({ row }: { row: PatientRow }) {
  return (
    <div style={styles.identity}>
      <span style={styles.name}>{row.name}</span>
      {row.masked_birth_date && <span style={styles.birth}>{row.masked_birth_date}</span>}
    </div>
  )
}

// ── 타일 ────────────────────────────────────────────────────────────────────

type Tone = 'ink' | 'primary' | 'warn' | 'danger' | 'done'

const TILE_SPECS: readonly { key: keyof TodaySummary['tiles']; label: string; tab: string; tone: Tone }[] = [
  { key: 'total_reserved', label: '전체 예약', tab: 'total', tone: 'ink' },
  { key: 'arrived', label: '도착', tab: 'arrived', tone: 'primary' },
  { key: 'waiting', label: '진료 대기', tab: 'waiting', tone: 'primary' },
  { key: 'in_progress', label: '진료 중', tab: 'in_progress', tone: 'warn' },
  { key: 'completed', label: '진료 완료', tab: 'completed', tone: 'done' },
  { key: 'cancelled_or_noshow', label: '취소·부도', tab: 'cancelled_or_noshow', tone: 'danger' },
]

function TileButton({ label, value, tone, onClick }: { label: string; value: number; tone: Tone; onClick: () => void }) {
  // TODAY-SUM-02·05: 여섯 타일 모두 눌린다(하나만 못 누르면 BTN-STATE-03 위반).
  return (
    <button type="button" aria-label={`${label} ${value}건`} onClick={onClick} style={styles.tileButton}>
      <StatTile value={value} label={label} tone={tone} />
    </button>
  )
}

// ── 시각·날짜 포맷 ───────────────────────────────────────────────────────────

/** 백엔드 time("09:30:00") → 시각 레일용 "09:30". */
function hhmm(t: string): string {
  return t.slice(0, 5)
}

/** 지난 날짜 행의 레일(TODAY-YDAY-03) — date("2026-08-02")+time → "8/2 16:30"(앞의 0을 뗀다). */
function mdHm(d: string, t: string): string {
  const [, m, day] = d.split('-')
  return `${Number(m)}/${Number(day)} ${hhmm(t)}`
}

// ── 날짜 (TODAY-DATE-01) ────────────────────────────────────────────────────

function todayLabel(): string {
  // ⚠️ 자정 자동 전환(TODAY-DATE-01)의 「스스로 갱신」은 실시간 구독(TODAY-LIVE-01)이 붙을 때 완성된다.
  //    여기서는 마운트 시점 날짜를 그린다.
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  }).format(new Date())
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: 20 },
  date: { fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)', fontWeight: 600 },
  loading: { color: 'var(--color-ink-muted)', fontSize: 'var(--fs-base)' },

  block: { display: 'flex', flexDirection: 'column', gap: 10 },
  blockHead: { display: 'flex', alignItems: 'center', gap: 8 },
  h2: { margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--color-ink)' },
  total: {
    fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--color-warn)',
    fontVariantNumeric: 'tabular-nums',
  },

  emptyWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
  emptyHint: { margin: '2px 0 0', fontSize: 'var(--fs-base)', color: 'var(--color-ink-muted)' },

  cards: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: {
    background: 'var(--color-surface)', border: '1px solid var(--color-divider)',
    borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-card)', overflow: 'hidden',
  },
  cardHead: {
    display: 'flex', alignItems: 'center', gap: 8,
    borderLeft: '4px solid var(--color-warn)', padding: '10px 12px',
  },
  cardTitle: { fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--color-ink)' },
  cardCount: { fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--color-warn)', fontVariantNumeric: 'tabular-nums' },
  rows: { display: 'flex', flexDirection: 'column' },

  row: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 12px', borderTop: '1px solid var(--color-divider)',
  },
  railWarn: {
    minWidth: 44, textAlign: 'center', padding: '4px 6px',
    background: 'var(--color-danger-bg)', color: 'var(--color-warn)',
    fontSize: 'var(--fs-sm)', fontWeight: 700, borderRadius: 6,
    fontVariantNumeric: 'tabular-nums',
  },
  // TODAY-ROW-02: 아직 오지 않은/지난 예약의 시각 레일은 옅은 회색(진행 중과 구분).
  railPast: {
    minWidth: 44, textAlign: 'center', padding: '4px 6px',
    background: 'var(--color-done-bg)', color: 'var(--color-gray-past)',
    fontSize: 'var(--fs-sm)', fontWeight: 700, borderRadius: 6,
    fontVariantNumeric: 'tabular-nums',
  },
  identity: { display: 'flex', flexDirection: 'column', minWidth: 96 },
  name: { fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--color-ink)' },
  birth: { fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  reason: { flex: 1, fontSize: 'var(--fs-base)', color: 'var(--color-ink)' },
  reasonWarn: { flex: 1, fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--color-warn)' },

  rowActions: { display: 'flex', gap: 6, marginLeft: 'auto' },
  btnQuiet: {
    height: 30, padding: '0 12px', borderRadius: 8,
    border: '1px solid var(--color-divider)', background: 'var(--color-surface)',
    color: 'var(--color-ink)', fontSize: 'var(--fs-sm)', fontWeight: 600, cursor: 'pointer',
  },
  btnPrimary: {
    height: 30, padding: '0 12px', borderRadius: 8,
    border: '1px solid var(--color-primary)', background: 'var(--color-primary)',
    color: 'var(--color-surface)', fontSize: 'var(--fs-sm)', fontWeight: 600, cursor: 'pointer',
  },

  tiles: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))', gap: 10 },
  tileButton: {
    display: 'block', padding: 0, border: 'none', background: 'none',
    textAlign: 'left', cursor: 'pointer', width: '100%',
  },

  // TODAY-DOC-01: 의사별 대기 — 요약 타일 아래 촘촘한 목록(콘솔 결).
  docWaitWrap: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 },
  docWaitHead: { fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--color-ink-muted)' },
  docWaitList: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6,
  },
  docWaitRow: {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8,
    padding: '6px 10px', border: '1px solid var(--color-divider)',
    borderRadius: 8, background: 'var(--color-surface)',
  },
  docWaitName: { fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--color-ink)' },
  docWaitCount: {
    fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--color-primary)',
    fontVariantNumeric: 'tabular-nums',
  },

  pendingLine: {
    display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4,
    fontSize: 'var(--fs-base)',
  },
  pendingLabel: { color: 'var(--color-ink-muted)', fontWeight: 600 },
  pendingUnknown: { color: 'var(--color-gray-past)' },
  pendingValue: { color: 'var(--color-ink)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
}
