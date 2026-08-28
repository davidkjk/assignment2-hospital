import { useMemo, useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { ReasonPromptDialog } from '../components/ReasonPromptDialog'
import { getQueue, type QueueRow, type QueueTab, type QueueTabCounts } from '../api/dashboard'
import { reorderQueue, setUrgentFlag, transitionStatus } from '../api/appointments'

/**
 * 대기 목록 `/queue` — 접수직원·관리자(route guard가 막는다). 목업 62 안 A(상태 탭).
 *
 * ⭐ 이 화면은 「오늘 예약된 사람 전부, 상태별로」다(셸 빈칸 B-6) — 7개 탭(QUEUE-TAB-01).
 * ⭐ 순번·탭 숫자는 서버가 전체 기준으로 준다(QUEUE-ORDER-03·QUEUE-FILT-03) — 화면은 자기 계산을
 *    하지 않는다. 의사 필터는 화면에서 거른다(서버가 이미 전체 기준 순번을 매겨 보냈으므로, 걸러도
 *    1·3·5로 띄엄해질 뿐 다시 매기지 않는다 — 직원의 「3번」과 의사의 「3번」이 어긋나지 않게).
 *
 * 범위: 조회·탭·필터·도착처리(예약확정→도착, →진료대기)·순서변경(사유 필수)·긴급표시. 당일 방문
 *   등록(워크인)은 헤더 「＋ 등록」 문이 여는 패널이다(QUEUE-WALK-01 — 화면 안 버튼 폐기).
 */

const TABS: readonly { key: QueueTab; label: string }[] = [
  { key: 'total', label: '전체' },
  { key: 'not_arrived', label: '미도착' },
  { key: 'arrived', label: '도착' },
  { key: 'waiting', label: '진료 대기' },
  { key: 'in_progress', label: '진료 중' },
  { key: 'completed', label: '진료 완료' },
  { key: 'cancelled_or_noshow', label: '취소·부도' },
]

const TAB_KEYS = new Set(TABS.map((t) => t.key))

function isTab(value: string | null): value is QueueTab {
  return value !== null && TAB_KEYS.has(value as QueueTab)
}

export function QueuePage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const client = useQueryClient()

  // QUEUE-TAB-07: 고른 탭은 URL에 남는다. 낯선 값·없으면 기본 「진료 대기」(QUEUE-TAB-03).
  const tab: QueueTab = isTab(params.get('tab')) ? (params.get('tab') as QueueTab) : 'waiting'
  const highlightId = params.get('appointment')
  const [doctorId, setDoctorId] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['queue', tab],
    // 의사 필터는 화면에서 건다 — 서버는 전체를 전체 순번과 함께 준다(QUEUE-ORDER-03).
    queryFn: () => getQueue({ tab }),
  })

  const invalidate = () => client.invalidateQueries({ queryKey: ['queue'] })

  function selectTab(next: QueueTab) {
    const p = new URLSearchParams(params)
    p.set('tab', next)
    p.delete('appointment') // 다른 탭으로 옮기면 지목 강조는 푼다.
    p.delete('action')
    setParams(p, { replace: true })
  }

  const counts: QueueTabCounts | undefined = query.data?.tab_counts
  const allRows = query.data?.rows ?? []

  // 의사 필터 옵션은 「전체 행」에서 뽑는다(필터를 걸어도 옵션이 사라지지 않게).
  const doctorOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of allRows) if (!seen.has(r.doctor_id)) seen.set(r.doctor_id, `${r.department_name} · ${r.doctor_name}`)
    return [...seen].map(([id, label]) => ({ id, label }))
  }, [allRows])

  const rows = doctorId ? allRows.filter((r) => r.doctor_id === doctorId) : allRows

  return (
    <section aria-label="대기 목록" style={styles.page}>
      <QueueTabs tab={tab} counts={counts} onSelect={selectTab} />

      <div style={styles.toolbar}>
        {/* QUEUE-FILT-03: 의사 필터. 탭 숫자는 필터를 따라가지 않는다(위 탭은 전체 기준). */}
        <label style={styles.filterLabel}>
          의사
          <select
            value={doctorId ?? ''}
            onChange={(e) => setDoctorId(e.target.value || null)}
            style={styles.select}
            aria-label="의사 필터"
          >
            <option value="">전체 의사</option>
            {doctorOptions.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </label>
      </div>

      {query.isPending && <p role="status" style={styles.loading}>대기 목록을 불러오는 중입니다</p>}
      {query.isError && <EmptyState kind="error" onRetry={() => query.refetch()} />}

      {query.data && (
        rows.length === 0 ? (
          <QueueEmpty tab={tab} filtered={doctorId !== null} />
        ) : (
          <div role="table" aria-label={`${labelFor(tab)} 목록`} style={styles.list}>
            {rows.map((row) => (
              <QueueRowView
                key={row.appointment_id}
                row={row}
                tab={tab}
                highlighted={row.appointment_id === highlightId}
                onChanged={invalidate}
                navigate={navigate}
              />
            ))}
          </div>
        )
      )}
    </section>
  )
}

// ── 탭 ──────────────────────────────────────────────────────────────────────

function QueueTabs({ tab, counts, onSelect }: {
  tab: QueueTab; counts?: QueueTabCounts; onSelect: (t: QueueTab) => void
}) {
  return (
    <div role="tablist" aria-label="상태" style={styles.tabs}>
      {TABS.map((t) => {
        const active = t.key === tab
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(t.key)}
            // QUEUE-TAB-11: 7개 탭을 같은 너비로(글자 수가 과녁 크기가 되지 않게).
            style={active ? { ...styles.tab, ...styles.tabActive } : styles.tab}
          >
            <span style={styles.tabLabel}>{t.label}</span>
            {/* QUEUE-TAB-06: 0명이어도 숨기지 않는다(0도 정보, 손이 기억한 자리가 흔들리지 않게). */}
            <span style={styles.tabCount}>{counts ? counts[t.key] : '–'}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── 빈 상태 ─────────────────────────────────────────────────────────────────

function QueueEmpty({ tab, filtered }: { tab: QueueTab; filtered: boolean }) {
  // QUEUE-WALK-01: 빈 상태에서도 화면 안에 등록 버튼을 다시 놓지 않는다 — 헤더 「＋ 등록」을 가리킨다.
  const hint = filtered
    ? '이 의사의 해당 상태 환자가 없습니다'
    : tab === 'waiting'
      ? '대기 중인 환자가 없습니다. 당일 방문은 위쪽 「＋ 등록」으로 받습니다'
      : '해당 상태의 환자가 없습니다'
  return (
    <div style={styles.emptyWrap}>
      <EmptyState kind="zero" message={hint} />
    </div>
  )
}

// ── 줄 ──────────────────────────────────────────────────────────────────────

function QueueRowView({ row, tab, highlighted, onChanged, navigate }: {
  row: QueueRow; tab: QueueTab; highlighted: boolean
  onChanged: () => void; navigate: (to: string) => void
}) {
  return (
    <div
      role="row"
      data-testid={`queue-row-${row.appointment_id}`}
      data-highlighted={highlighted || undefined}
      style={{
        ...styles.row,
        // QUEUE-ROW-08: /today에서 지목해 들어온 줄은 강조된 채로 연다.
        ...(highlighted ? styles.rowHighlight : null),
        // QUEUE-URG-01: 좌측 4px 주의색 바(배경은 칠하지 않는다).
        ...(row.is_urgent_flag ? styles.rowUrgent : null),
      }}
    >
      <div style={styles.lead}>{leadContent(row, tab)}</div>
      <div style={styles.identity}>
        <span style={styles.name}>
          {row.name}
          {/* QUEUE-WALK-12: 슬롯 없이 방문 시각으로 들어온 줄엔 당일 방문 배지. */}
          {row.is_walkin && <span style={styles.walkinBadge}>당일 방문</span>}
          {row.is_urgent_flag && <span style={styles.urgentTag}>▲ 응급/주의</span>}
        </span>
        <span style={styles.birth}>{row.masked_birth_date}</span>
      </div>
      <span style={styles.doctor}>{row.department_name} · {row.doctor_name}</span>
      <div style={styles.actions}>
        <RowActions row={row} tab={tab} onChanged={onChanged} navigate={navigate} />
      </div>
    </div>
  )
}

/** 순번(진료 대기) / 예약 시각(미도착) / 빈칸(그 밖) — QUEUE-ORDER-01·02·10. */
function leadContent(row: QueueRow, tab: QueueTab) {
  if (tab === 'waiting' && row.queue_no != null) {
    return <span style={styles.queueNo}>{row.queue_no}<span style={styles.queueNoUnit}>번</span></span>
  }
  if (tab === 'not_arrived' && row.slot_time) {
    return <span style={styles.slotTime}>{row.slot_time.slice(0, 5)}</span>
  }
  // 전체 탭은 상태 배지에 순번을 함께(QUEUE-ROW-09) — 그 밖은 빈칸(QUEUE-ORDER-02).
  if (tab === 'total') {
    return <span style={styles.statusBadge}>{statusLabel(row)}</span>
  }
  return <span aria-hidden="true" />
}

function statusLabel(row: QueueRow): string {
  if (row.status === '진료대기' && row.queue_no != null) return `진료 대기 · ${row.queue_no}번`
  return STATUS_LABELS[row.status] ?? row.status
}

const STATUS_LABELS: Record<string, string> = {
  예약신청: '미도착', 예약확정: '미도착', 도착: '도착', 진료대기: '진료 대기',
  진료중: '진료 중', 진료완료: '진료 완료', 환자취소: '환자 취소', 병원취소: '병원 취소', 예약부도: '예약 부도',
}

// ── 줄의 버튼 (QUEUE-BTN-01~06) ──────────────────────────────────────────────

function RowActions({ row, tab, onChanged, navigate }: {
  row: QueueRow; tab: QueueTab; onChanged: () => void; navigate: (to: string) => void
}) {
  const detail = (
    <button type="button" style={styles.btnQuiet} onClick={() => navigate(`/patients/${row.patient_id}`)}>
      환자 상세
    </button>
  )

  // 전체 탭은 줄마다 그 줄의 상태를 따른다(QUEUE-BTN-08).
  const effective = tab === 'total' ? tabForStatus(row.status) : tab

  if (effective === 'not_arrived') {
    return <ArrivalActions row={row} onChanged={onChanged} navigate={navigate} />
  }
  if (effective === 'arrived') {
    // QUEUE-BTN-02: [진료 대기] + [환자 상세]. 직원이 앞당겨 넣을 때만 쓴다.
    return <><ToWaitingButton row={row} onChanged={onChanged} />{detail}</>
  }
  if (effective === 'waiting') {
    // QUEUE-BTN-03: 상태를 바꾸는 버튼이 없다(진료중은 의사 자동). [응급/주의 표시] + [환자 상세].
    return <><UrgentButton row={row} onChanged={onChanged} /><ReorderButton row={row} onChanged={onChanged} />{detail}</>
  }
  if (effective === 'cancelled_or_noshow') {
    // QUEUE-BTN-05: [재예약](캘린더 사이드패널) + [환자 상세].
    return (
      <>
        <button type="button" style={styles.btnQuiet} onClick={() => navigate(`/calendar?appointment=${row.appointment_id}`)}>
          재예약
        </button>
        {detail}
      </>
    )
  }
  // QUEUE-BTN-04: 진료 중·진료 완료 — [환자 상세]만.
  return detail
}

function tabForStatus(status: string): QueueTab {
  if (status === '예약신청' || status === '예약확정') return 'not_arrived'
  if (status === '도착') return 'arrived'
  if (status === '진료대기') return 'waiting'
  if (status === '진료중') return 'in_progress'
  if (status === '진료완료') return 'completed'
  return 'cancelled_or_noshow'
}

/** 미도착 줄: [진료 대기]·[도착] 두 갈래 + [번호 보기] (QUEUE-BTN-01·ARRIVE-01~03). */
function ArrivalActions({ row, onChanged, navigate }: {
  row: QueueRow; onChanged: () => void; navigate: (to: string) => void
}) {
  const client = useQueryClient()
  // 예약 시각이 됐/지났으면 [진료 대기]가 추천(딥틸), 아직 일찍이면 [도착]이 추천 — 자리는 고정, 색만 옮긴다.
  const reached = row.slot_time ? row.slot_time.slice(0, 5) <= nowHHMM() : true

  const toArrived = useMutation({
    mutationFn: () => transitionStatus(row.appointment_id, { new_status: '도착', expected_updated_at: row.updated_at }),
    onSuccess: onChanged,
  })

  // ARRIVE-02: [진료 대기]는 바로 진료대기로. 백엔드 전이표는 예약확정→도착→진료대기라, 도착을 거쳐
  // 진료대기까지 이어 붙인다(둘 다 이미 허용된 전이). 중간 도착 상태의 최신 updated_at을 다시 읽어 잇는다.
  const toWaiting = useMutation({
    mutationFn: async () => {
      await transitionStatus(row.appointment_id, { new_status: '도착', expected_updated_at: row.updated_at })
      const fresh = await getQueue({ tab: 'arrived' })
      const arrived = fresh.rows.find((r) => r.appointment_id === row.appointment_id)
      if (arrived) {
        await transitionStatus(row.appointment_id, { new_status: '진료대기', expected_updated_at: arrived.updated_at })
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['queue'] }),
  })

  const busy = toArrived.isPending || toWaiting.isPending
  return (
    <>
      {/* 버튼 순서는 항상 [진료 대기][도착]으로 고정(QUEUE-BTN-01) — 추천만 색으로 옮긴다. */}
      <button type="button" disabled={busy}
        style={reached ? styles.btnPrimary : styles.btnQuiet}
        onClick={() => toWaiting.mutate()}>
        진료 대기
      </button>
      <button type="button" disabled={busy}
        style={reached ? styles.btnQuiet : styles.btnPrimary}
        onClick={() => toArrived.mutate()}>
        도착
      </button>
      {/* QUEUE-BTN-06: [번호 보기]는 미도착 탭에만 — 원문 공개는 환자 상세에서(MASK-VIEW). */}
      <button type="button" style={styles.btnQuiet} onClick={() => navigate(`/patients/${row.patient_id}`)}>
        번호 보기
      </button>
    </>
  )
}

/** 도착(보류) 줄에서 직원이 앞당겨 진료 대기로 넣는다(QUEUE-BTN-02). */
function ToWaitingButton({ row, onChanged }: { row: QueueRow; onChanged: () => void }) {
  const mutation = useMutation({
    mutationFn: () => transitionStatus(row.appointment_id, { new_status: '진료대기', expected_updated_at: row.updated_at }),
    onSuccess: onChanged,
  })
  return (
    <button type="button" style={styles.btnPrimary} disabled={mutation.isPending} onClick={() => mutation.mutate()}>
      진료 대기
    </button>
  )
}

/** 응급/주의 표시 — 켜기·끄기 모두 확인창을 거친다(QUEUE-URG-02·03·04·05). */
function UrgentButton({ row, onChanged }: { row: QueueRow; onChanged: () => void }) {
  const [asking, setAsking] = useState(false)
  const mutation = useMutation({
    mutationFn: () => setUrgentFlag(row.appointment_id, { is_urgent: !row.is_urgent_flag, expected_updated_at: row.updated_at }),
    onSuccess: () => { setAsking(false); onChanged() },
  })
  return (
    <>
      <button type="button" style={styles.btnQuiet} onClick={() => setAsking(true)}>
        {row.is_urgent_flag ? '표시 끄기' : '응급/주의 표시'}
      </button>
      {asking && (
        <ConfirmDialog
          title={row.is_urgent_flag ? '응급/주의 표시를 끕니다' : '응급/주의로 표시합니다'}
          // QUEUE-URG-03·04: 의학적 판정이 아니며 순서가 바뀌지 않음을 화면에 그대로 띄운다.
          message={row.is_urgent_flag
            ? '먼저 봐야 할 표시를 내립니다.'
            : '이 표시는 먼저 봐야 할 환자를 눈에 띄게 하는 것일 뿐, 의학적 응급도 판정이 아닙니다. 표시해도 대기 순서는 바뀌지 않습니다.'}
          confirmLabel={mutation.isPending ? '처리 중…' : '확인'}
          onConfirm={() => { if (!mutation.isPending) mutation.mutate() }}
          onCancel={() => setAsking(false)}
        />
      )}
    </>
  )
}

/** 순서 변경 — 놓은 뒤 사유를 반드시 받는다(QUEUE-ORDER-05·06·09). 빈 사유면 확인이 안 열린다. */
function ReorderButton({ row, onChanged }: { row: QueueRow; onChanged: () => void }) {
  const [target, setTarget] = useState<number | null>(null)
  const mutation = useMutation({
    mutationFn: (reason: string) => reorderQueue(row.appointment_id, { new_position: target!, reason }),
    onSuccess: () => { setTarget(null); onChanged() },
  })
  return (
    <>
      <button type="button" style={styles.btnQuiet}
        onClick={() => setTarget(Math.max(1, (row.queue_no ?? 1) - 1))}
        aria-label="대기 순서 변경">
        순서 변경
      </button>
      {target !== null && (
        <ReasonPromptDialog
          title={`${row.name} 님을 ${row.queue_no}번 → ${target}번으로 변경합니다`}
          hint="바꾼 사람과 이유가 기록에 남습니다"
          onSubmit={(reason) => mutation.mutate(reason)}
          onCancel={() => setTarget(null)}
        />
      )}
    </>
  )
}

// ── 유틸 ────────────────────────────────────────────────────────────────────

function nowHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function labelFor(tab: QueueTab): string {
  return TABS.find((t) => t.key === tab)?.label ?? '대기'
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: 12 },

  tabs: { display: 'flex', gap: 4 },
  tab: {
    flex: '1 1 92px', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    padding: '8px 4px', borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', cursor: 'pointer', color: 'var(--color-ink-muted)',
  },
  tabActive: {
    borderColor: 'var(--color-primary)', background: 'var(--color-primary-wash)', color: 'var(--color-ink)',
  },
  tabLabel: { fontSize: 'var(--fs-sm)', fontWeight: 700, whiteSpace: 'nowrap' },
  tabCount: { fontSize: 'var(--fs-base)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' },

  toolbar: { display: 'flex', alignItems: 'center', gap: 8 },
  filterLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)', fontWeight: 600 },
  select: {
    height: 32, padding: '0 8px', borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 'var(--fs-sm)',
  },
  loading: { color: 'var(--color-ink-muted)', fontSize: 'var(--fs-base)' },
  emptyWrap: { display: 'flex', justifyContent: 'center', padding: '24px 0' },

  list: { display: 'flex', flexDirection: 'column', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-card)', overflow: 'hidden', background: 'var(--color-surface)' },
  row: {
    display: 'grid', gridTemplateColumns: '64px minmax(120px, 1.4fr) minmax(120px, 1fr) auto',
    alignItems: 'center', gap: 12, minHeight: 52, padding: '6px 12px',
    borderTop: '1px solid var(--color-divider)', borderLeft: '4px solid transparent',
  },
  rowHighlight: { background: 'var(--color-primary-wash)' },
  rowUrgent: { borderLeftColor: 'var(--color-warn)' },

  lead: { display: 'flex', alignItems: 'center', justifyContent: 'flex-start', minWidth: 0 },
  queueNo: { fontSize: 'var(--fs-num)', fontWeight: 800, color: 'var(--color-primary)', fontVariantNumeric: 'tabular-nums' },
  queueNoUnit: { fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--color-ink-muted)', marginLeft: 2 },
  slotTime: { fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' },
  statusBadge: { fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--color-ink-muted)' },

  identity: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  name: { fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--color-ink)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  birth: { fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' },
  walkinBadge: {
    fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--color-primary)',
    background: 'var(--color-primary-wash)', borderRadius: 6, padding: '1px 6px',
  },
  urgentTag: { fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--color-warn)' },
  doctor: { fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

  actions: { display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' },
  btnQuiet: {
    height: 36, padding: '0 12px', borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 'var(--fs-sm)', fontWeight: 600, cursor: 'pointer',
  },
  btnPrimary: {
    height: 36, padding: '0 12px', borderRadius: 8, border: '1px solid var(--color-primary)',
    background: 'var(--color-primary)', color: 'var(--color-surface)', fontSize: 'var(--fs-sm)', fontWeight: 600, cursor: 'pointer',
  },
}
