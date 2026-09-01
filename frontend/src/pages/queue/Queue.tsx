import { useMemo, useState } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, UserRound, X } from '../../components/icons'
import { StaffPage } from '../../components/staff-ui'
import { EmptyState } from '../../components/EmptyState'
import { hospitalHHMM } from '../../lib/clock'
import { getQueue, type QueueRow, type QueueTab, type QueueTabCounts } from '../../api/dashboard'
import { reorderQueue, setUrgentFlag, transitionStatus } from '../../api/appointments'
import { undoStatus } from '../../api/doctorConsole'
import { revealContact } from '../../api/patients'

// 대기 목록 (/queue) — QUEUE-*.
// 데모 뼈대(딥틸 탭·드래그 순서변경·삽입선·전체 탭 묶기 토글, 폰 검수 세공)에 실 데이터
// (getQueue)와 실 전이(transitionStatus·reorderQueue·setUrgentFlag·revealContact)를 배선했다.
//
// ⭐ 순번·탭 숫자는 서버가 전체 기준으로 준다(QUEUE-ORDER-03·QUEUE-FILT-03). 화면은 다시 매기지 않는다.
// ⭐ 진료중 전이는 의사가 여는 순간 자동이라 접수용 상태변경 버튼은 없다(QUEUE-BTN-03·DOCTOR-START-01).
//
// 판정 로그(2026-08-29, 원문 grep):
//  · 번호 보기 = 그 줄 인라인 펼침(QUEUE-BTN-06·MASK-VIEW-01) — 미도착 탭에만. 실 옛 코드의 navigate는 규칙 위반이라 버림.
//  · 응급 표시자「○○ 님이 켰습니다」(QUEUE-URG-06) = ✅ 해소(A4-b, 마이그 00071 urgent_flagged_by/at) — 끄기 팝업에 「오늘 HH:MM · ○○ 님이 켰습니다」.
//  · 도착·진료대기 줄 [되돌리기] = 정본 QUEUE-BTN-02/03에 없어 버튼 없이 이식(백엔드 UNDO는 별개, 노출 위치 미결).
//  · 대기시간 컬럼 = ✅ 해소(A4-a, wait_minutes·wait_is_long) — 상태별 문구(경과/대기/N분째)와 기준 초과 주의색.

const REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** 지금 몇 시인가 — **병원 시계**다(TIME-TZ-01). 예약 시각이 됐는지 재는 데 쓰인다. */
export function nowHHMM(at: Date = new Date()): string {
  return hospitalHHMM(at)
}

// 실 7탭 키 + 데모 레이아웃(G-3: 「미도착」, 「아직 안 옴」 아님).
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
const isTab = (v: string | null): v is QueueTab => v !== null && TAB_KEYS.has(v as QueueTab)

/** 실 한글 상태 → 탭 키(전체 탭에서 줄마다 그 줄의 상태를 따른다, QUEUE-BTN-08). */
function tabForStatus(status: string): QueueTab {
  if (status === '예약신청' || status === '예약확정') return 'not_arrived'
  if (status === '도착') return 'arrived'
  if (status === '진료대기') return 'waiting'
  if (status === '진료중') return 'in_progress'
  if (status === '진료완료') return 'completed'
  return 'cancelled_or_noshow'
}

const STATUS_LABEL: Record<string, string> = {
  예약신청: '미도착', 예약확정: '미도착', 도착: '도착', 진료대기: '진료 대기',
  진료중: '진료 중', 진료완료: '진료 완료', 환자취소: '환자 취소', 병원취소: '병원 취소', 예약부도: '예약 부도',
}
const STATUS_TONE: Record<QueueTab, string> = {
  total: 'bg-slate-400',
  not_arrived: 'bg-slate-400',
  arrived: 'bg-violet-600',
  waiting: 'bg-sky-600',
  in_progress: 'bg-primary',
  completed: 'bg-slate-500',
  cancelled_or_noshow: 'bg-amber-500',
}

/** 데모 공통 버튼 — 딥틸 꽉 참=그 자리 완결 / 흰 테두리=다른 화면. */
// variant='detail' = [환자 상세] 전용(사용자 지시 2026-08-30) — 상태 처리 버튼(진료 대기·되돌리기·응급/주의·재예약…)과
// 한 줄에 섞이므로, 외곽선 + 사람 아이콘으로 늘 같은 모습을 유지해 '이 환자 기록 열기'임을 한눈에 구분한다.
function Btn({
  children, variant = 'ghost', onClick, disabled, ariaLabel,
}: {
  children: React.ReactNode
  variant?: 'primary' | 'outline' | 'ghost' | 'detail'
  onClick?: () => void
  disabled?: boolean
  ariaLabel?: string
}) {
  const styles = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    outline: 'border border-border bg-card hover:bg-muted',
    ghost: 'text-primary hover:bg-primary/8',
    detail: 'border border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted',
  }[variant]
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1.5 h-9 rounded-md px-2.5 text-sm font-medium whitespace-nowrap transition-colors disabled:opacity-50 ${styles}`}
    >
      {variant === 'detail' && <UserRound width={15} height={15} aria-hidden="true" className="-ml-0.5 text-muted-foreground" />}
      {children}
    </button>
  )
}

export function Queue() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const client = useQueryClient()

  // QUEUE-TAB-07: 고른 탭은 URL에 남는다. 낯설거나 없으면 기본 「진료 대기」(QUEUE-TAB-03).
  const activeTab: QueueTab = isTab(params.get('tab')) ? (params.get('tab') as QueueTab) : 'waiting'
  const highlightId = params.get('appointment')
  const isWaitingTab = activeTab === 'waiting'

  const [doctorId, setDoctorId] = useState<string | null>(null)
  const [allGroup, setAllGroup] = useState<'time' | 'status'>('time') // 전체 탭 묶기(QUEUE-TAB-09)

  // 원문 공개(인라인) — 누른 줄만 서버에서 번호를 받아 펼친다(MASK-VIEW-01·02).
  const [phones, setPhones] = useState<Record<string, string>>({})

  // 팝업 상태
  const [urgFor, setUrgFor] = useState<{ row: QueueRow; turningOn: boolean } | null>(null)
  const [reorderState, setReorderState] = useState<{ row: QueueRow; from: number; to: number } | null>(null)

  // 드래그 상태(진료 대기 탭만)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null) // 이 줄 '앞'에 삽입선. '__end__'=맨 끝

  const query = useQuery({
    queryKey: ['queue', activeTab],
    // 의사 필터는 화면에서 건다 — 서버는 전체를 전체 순번과 함께 준다(QUEUE-ORDER-03).
    queryFn: () => getQueue({ tab: activeTab }),
  })

  const invalidate = () => client.invalidateQueries({ queryKey: ['queue'] })

  const counts: QueueTabCounts | undefined = query.data?.tab_counts
  const allRows = query.data?.rows ?? []

  // 의사 필터 옵션은 「전체 행」에서 뽑는다(필터를 걸어도 옵션이 사라지지 않게).
  const doctorOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of allRows) if (!seen.has(r.doctor_id)) seen.set(r.doctor_id, `${r.department_name} · ${r.doctor_name}`)
    return [...seen].map(([id, label]) => ({ id, label }))
  }, [allRows])

  const rows = doctorId ? allRows.filter((r) => r.doctor_id === doctorId) : allRows

  // 진료 대기 탭의 드래그 대상 = 렌더 순서(서버가 순번대로 준 rows)
  const waitingIds = useMemo(() => (isWaitingTab ? rows.map((r) => r.appointment_id) : []), [isWaitingTab, rows])
  const byId = useMemo(() => new Map(rows.map((r) => [r.appointment_id, r])), [rows])

  function selectTab(next: QueueTab) {
    const p = new URLSearchParams(params)
    if (next === 'waiting') p.delete('tab')
    else p.set('tab', next)
    p.delete('appointment') // 다른 탭으로 옮기면 지목 강조는 푼다.
    p.delete('action')
    setParams(p, { replace: true })
  }

  async function reveal(row: QueueRow) {
    try {
      const c = await revealContact(row.patient_id)
      const phone = (c.phone as string) ?? null
      if (phone) setPhones((m) => ({ ...m, [row.appointment_id]: phone }))
    } catch {
      /* 조회 실패는 조용히 — 줄 전체를 무너뜨리지 않는다 */
    }
  }

  // ── 드래그 순서 변경(진료 대기 탭만) — targetId 앞에 dragId를 끼운 결과 ──
  function previewOrder(targetId: string): string[] {
    const ids = [...waitingIds]
    const from = ids.indexOf(dragId!)
    if (from < 0) return ids
    ids.splice(from, 1)
    if (targetId === '__end__') ids.push(dragId!)
    else {
      const at = ids.indexOf(targetId)
      ids.splice(at < 0 ? ids.length : at, 0, dragId!)
    }
    return ids
  }
  function previewPos(targetId: string): number {
    return previewOrder(targetId).indexOf(dragId!) + 1
  }
  function onDrop(targetId: string) {
    if (!dragId) return
    const next = previewOrder(targetId)
    const from = waitingIds.indexOf(dragId) + 1
    const to = next.indexOf(dragId) + 1
    const row = byId.get(dragId)
    setDragId(null)
    setOverId(null)
    if (!row || from === to) return // 자리 안 바뀜
    setReorderState({ row, from, to })
  }

  const InsertBar = ({ targetId }: { targetId: string }) =>
    dragId && overId === targetId && dragId !== targetId ? (
      <div className="pointer-events-none relative h-0">
        <div className="absolute inset-x-3 -top-px flex items-center">
          <span className="h-[3px] flex-1 rounded-full bg-primary shadow-[0_0_0_1px_rgba(255,255,255,0.6)]" />
          <span className="ml-2 rounded-md bg-primary px-2 py-0.5 text-[0.72rem] font-bold text-primary-foreground shadow-sm whitespace-nowrap">
            ▸ {previewPos(targetId)}번 자리
          </span>
        </div>
      </div>
    ) : null

  return (
    <StaffPage max="max-w-5xl" testid="queue">
      {/* ── 상태 탭 7개 + (전체일 때) 묶기 토글 ── */}
      <div className="mb-4 flex items-center gap-3">
        <div role="tablist" aria-label="상태" className="flex flex-1 gap-1 rounded-xl border border-border/70 bg-card p-1 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          {TABS.map((t) => {
            const on = activeTab === t.key
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={on}
                onClick={() => selectTab(t.key)}
                // QUEUE-TAB-11: 같은 너비로(글자 수가 과녁 크기가 되지 않게).
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-1 py-2 text-sm font-medium transition-colors ${
                  on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <span className="whitespace-nowrap">{t.label}</span>
                {/* QUEUE-TAB-06: 0명이어도 숨기지 않는다. */}
                <span className={`text-xs tabular-nums ${on ? 'text-primary-foreground/80' : 'text-muted-foreground/70'}`}>
                  {counts ? counts[t.key] : '–'}
                </span>
              </button>
            )
          })}
        </div>

        {activeTab === 'total' && (
          <div className="flex shrink-0 gap-0.5 rounded-xl border border-border/70 bg-card p-1 text-sm shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
            {([['time', '시각순'], ['status', '상태별']] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setAllGroup(k)}
                className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                  allGroup === k ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 의사 필터 — 탭 숫자는 필터를 따라가지 않는다(QUEUE-FILT-03). */}
      <div className="mb-3 flex items-center gap-2 text-sm">
        {/* 라벨 글자는 없앤다 — 셀렉트가 「전체 의사」로 이미 무엇을 고르는지 말한다(중복 제거). aria-label로 접근성 유지. */}
        <label className="flex items-center gap-2 font-medium text-muted-foreground">
          <select
            value={doctorId ?? ''}
            onChange={(e) => setDoctorId(e.target.value || null)}
            aria-label="의사 필터"
            className="h-8 rounded-lg border border-border bg-card px-2 text-foreground"
          >
            <option value="">전체 의사</option>
            {doctorOptions.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </label>
      </div>

      {/* 도착 탭 안내 — '도착'의 새 뜻(일찍 오신 분·자동 전환)을 한 번에 설명 */}
      {activeTab === 'arrived' && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3.5 py-2.5 text-sm text-violet-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
          <p>
            예약 시각보다 <b>일찍 오신 분</b>들입니다. 왼쪽 <span className="tabular-nums font-medium text-violet-700">예약 시각</span>이 되면
            <b> 자동으로 「진료 대기」</b>로 넘어갑니다(직원이 다시 누를 필요 없음). 지금 바로 넣으려면 <b>[진료 대기]</b>를 누르세요.
          </p>
        </div>
      )}

      {query.isPending && <p role="status" className="text-muted-foreground">대기 목록을 불러오는 중입니다</p>}
      {query.isError && <EmptyState kind="error" onRetry={() => query.refetch()} />}

      {query.data && (
        activeTab === 'total' && allGroup === 'status' ? (
          <GroupedList rows={rows} state={{ phones, reveal, navigate, onChanged: invalidate, setUrgFor, highlightId }} />
        ) : rows.length === 0 ? (
          <QueueEmpty tab={activeTab} filtered={doctorId !== null} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
            <div role="table" aria-label={`${labelFor(activeTab)} 목록`} onDragOver={(e) => { if (isWaitingTab) e.preventDefault() }}>
              {rows.map((r, i) => (
                <div key={r.appointment_id}>
                  {isWaitingTab && <InsertBar targetId={r.appointment_id} />}
                  <RowNode
                    row={r}
                    index={i}
                    tab={activeTab}
                    showBadge={activeTab === 'total'}
                    highlighted={r.appointment_id === highlightId}
                    phones={phones}
                    reveal={reveal}
                    navigate={navigate}
                    onChanged={invalidate}
                    setUrgFor={setUrgFor}
                    drag={isWaitingTab ? {
                      dragId,
                      onStart: () => { setDragId(r.appointment_id); setOverId(r.appointment_id) },
                      onOver: () => setOverId(r.appointment_id),
                      onDrop: () => onDrop(r.appointment_id),
                      onEnd: () => { setDragId(null); setOverId(null) },
                    } : undefined}
                  />
                </div>
              ))}
              {/* 맨 끝(줄 맨 뒤로 보내기) 드롭 존 */}
              {isWaitingTab && dragId && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setOverId('__end__') }}
                  onDrop={() => onDrop('__end__')}
                  className="relative h-6"
                >
                  <InsertBar targetId="__end__" />
                </div>
              )}
            </div>
          </div>
        )
      )}

      {isWaitingTab && rows.length > 0 && (
        <p className="mt-2 px-1 text-xs text-muted-foreground">
          줄을 끌어 순서를 바꿀 수 있습니다 · 놓을 자리에 순번이 표시되고, 바꾼 사람과 이유가 기록에 남습니다
        </p>
      )}

      {/* ── 응급/주의 확인 팝업(QUEUE-URG-02~05) ── */}
      {urgFor && (
        <UrgentDialog
          row={urgFor.row}
          turningOn={urgFor.turningOn}
          onClose={() => setUrgFor(null)}
          onDone={() => { setUrgFor(null); invalidate() }}
        />
      )}

      {/* ── 순서 변경 사유 팝업(QUEUE-ORDER-05~09, 바깥 클릭으로 안 닫힘) ── */}
      {reorderState && (
        <ReorderDialog
          row={reorderState.row}
          from={reorderState.from}
          to={reorderState.to}
          onClose={() => setReorderState(null)}
          onDone={() => { setReorderState(null); invalidate() }}
        />
      )}
    </StaffPage>
  )
}

// ── 한 줄 ─────────────────────────────────────────────────────────────────────

interface DragHandlers {
  dragId: string | null
  onStart: () => void
  onOver: () => void
  onDrop: () => void
  onEnd: () => void
}

function RowNode({
  row, index, tab, showBadge, highlighted, phones, reveal, navigate, onChanged, setUrgFor, drag,
}: {
  row: QueueRow
  index: number
  tab: QueueTab
  showBadge: boolean
  highlighted: boolean
  phones: Record<string, string>
  reveal: (row: QueueRow) => void
  navigate: NavigateFunction
  onChanged: () => void
  setUrgFor: (v: { row: QueueRow; turningOn: boolean }) => void
  drag?: DragHandlers
}) {
  const urgent = row.is_urgent_flag
  const isDragging = drag?.dragId === row.appointment_id
  const phone = phones[row.appointment_id]
  return (
    <div
      role="row"
      data-testid={`queue-row-${row.appointment_id}`}
      data-highlighted={highlighted || undefined}
      draggable={!!drag}
      onDragStart={drag?.onStart}
      onDragOver={drag ? (e) => { e.preventDefault(); drag.onOver() } : undefined}
      onDrop={drag?.onDrop}
      onDragEnd={drag?.onEnd}
      className={`relative flex h-[52px] items-center gap-3 pl-4 pr-3 transition-all duration-200 motion-reduce:transition-none ${
        index > 0 ? 'border-t border-border/60' : ''
      } ${urgent ? 'border-l-4 border-l-amber-500' : ''} ${
        highlighted ? 'bg-primary/[0.06]' : ''
      } ${isDragging ? 'rounded-lg border border-dashed border-primary/50 bg-primary/[0.04] opacity-50' : ''} ${
        drag && !isDragging ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
    >
      {/* 순번(진료대기) / 예약시각(미도착) / 빈칸 (QUEUE-ORDER-01·02·10) */}
      <div className="w-12 shrink-0 text-right">
        {tab === 'waiting' && row.queue_no != null ? (
          <span className="font-bold text-primary tabular-nums">
            {row.queue_no}<span className="ml-0.5 text-xs font-normal text-muted-foreground">번</span>
          </span>
        ) : (tab === 'not_arrived' || tabForStatus(row.status) === 'not_arrived') && row.slot_time ? (
          <span className="text-sm tabular-nums text-foreground/70">{row.slot_time.slice(0, 5)}</span>
        ) : tabForStatus(row.status) === 'arrived' && row.slot_time ? (
          // 예약 시각 = 자동으로 진료 대기로 넘어가는 시각
          <span className="text-sm tabular-nums text-violet-600">{row.slot_time.slice(0, 5)}</span>
        ) : null}
      </div>

      {/* 이름 (+ 응급/당일방문 표식) */}
      <div className="flex w-40 shrink-0 items-center gap-1.5">
        <span className="font-semibold">{row.name}</span>
        {urgent && (
          <span className="inline-flex items-center gap-0.5 text-xs font-bold text-amber-600">
            <AlertTriangle className="h-3 w-3" />응급
          </span>
        )}
        {/* QUEUE-WALK-12: 슬롯 없이 방문 시각으로 들어온 줄엔 당일 방문 배지. */}
        {row.is_walkin && (
          <span className="rounded bg-muted px-1 py-0.5 text-[0.65rem] text-muted-foreground">당일 방문</span>
        )}
      </div>

      {/* 생년월일(마스킹) / 번호 펼침(MASK-VIEW-01) */}
      <div className="w-40 shrink-0 text-sm text-muted-foreground">
        {phone ? (
          <span className="font-medium text-foreground">
            {phone}
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(phone)}
              className="ml-2 text-xs font-medium text-primary hover:underline"
            >
              복사
            </button>
          </span>
        ) : (
          row.masked_birth_date
        )}
      </div>

      {/* 대기시간 (QUEUE-ROW-05·06) — 도착/진료대기/진료중일 때만. 기준 초과면 주의색(배경은 안 칠한다). */}
      <div className="w-20 shrink-0 text-sm tabular-nums">
        {row.wait_minutes != null && (
          <span className={row.wait_is_long ? 'font-medium text-amber-600' : 'text-muted-foreground'}>
            {waitLabel(row.status, row.wait_minutes)}
          </span>
        )}
      </div>

      {/* 진료과/의사 */}
      <div className="hidden w-28 shrink-0 text-sm text-muted-foreground md:block">
        {row.department_name} {row.doctor_name}
      </div>

      {/* 전체 탭: 상태 배지(진료대기면 순번 함께) */}
      {showBadge && (
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium text-white ${STATUS_TONE[tabForStatus(row.status)]}`}>
          {STATUS_LABEL[row.status] ?? row.status}
          {row.status === '진료대기' && row.queue_no != null ? ` · ${row.queue_no}번` : ''}
        </span>
      )}

      {/* 상태별 버튼 — 전체 탭도 줄마다 그 상태의 버튼(QUEUE-BTN-08) */}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <RowActions row={row} tab={tab} reveal={reveal} navigate={navigate} onChanged={onChanged} setUrgFor={setUrgFor} />
      </div>
    </div>
  )
}

// ── 줄의 버튼(QUEUE-BTN-01~06) ────────────────────────────────────────────────

function RowActions({
  row, tab, reveal, navigate, onChanged, setUrgFor,
}: {
  row: QueueRow
  tab: QueueTab
  reveal: (row: QueueRow) => void
  navigate: NavigateFunction
  onChanged: () => void
  setUrgFor: (v: { row: QueueRow; turningOn: boolean }) => void
}) {
  const detail = <Btn key="d" variant="detail" onClick={() => navigate(`/patients/${row.patient_id}`)}>환자 상세</Btn>
  // 전체 탭은 줄마다 그 줄의 상태를 따른다(QUEUE-BTN-08).
  const effective = tab === 'total' ? tabForStatus(row.status) : tab

  switch (effective) {
    case 'not_arrived':
      return <ArrivalActions row={row} reveal={reveal} onChanged={onChanged} />
    case 'arrived':
      // QUEUE-BTN-02(개정 2026-08-24): [진료 대기] + [되돌리기](UNDO-*) + [환자 상세]. 앞당겨 넣을 때만 [진료 대기].
      return <><ToWaitingButton key="w" row={row} onChanged={onChanged} /><UndoButton key="u" row={row} onChanged={onChanged} />{detail}</>
    case 'waiting':
      // QUEUE-BTN-03(전역 UNDO-BTN-01·SCOPE-01): 진료중 전이 버튼은 없다(의사 자동). [응급/주의] + [되돌리기] + [환자 상세].
      // ⚠️ QUEUE-BTN-03 본문은 「응급/주의+환자 상세만」이라 되돌리기를 안 적었으나, 전역 되돌리기 규칙(진료대기=되돌릴 수 있는 4상태)이
      //    우선한다(문서 낡음 — 사용자 확인 대기). 순서변경은 드래그.
      return (
        <>
          <Btn key="e" variant="outline" onClick={() => setUrgFor({ row, turningOn: !row.is_urgent_flag })}>
            {row.is_urgent_flag ? '표시 끄기' : '응급/주의 표시'}
          </Btn>
          <UndoButton key="u" row={row} onChanged={onChanged} />
          {detail}
        </>
      )
    case 'cancelled_or_noshow':
      // QUEUE-BTN-05: [재예약](캘린더) + [환자 상세].
      return (
        <>
          <Btn key="r" variant="outline" onClick={() => navigate(`/calendar?appointment=${row.appointment_id}`)}>재예약</Btn>
          {detail}
        </>
      )
    default:
      // QUEUE-BTN-04: 진료 중·진료 완료 — [환자 상세]만.
      return detail
  }
}

/** 미도착 줄: [진료 대기]·[도착] 두 갈래 + [번호 보기] (QUEUE-BTN-01·06·ARRIVE-01~03). */
function ArrivalActions({ row, reveal, onChanged }: {
  row: QueueRow; reveal: (row: QueueRow) => void; onChanged: () => void
}) {
  const client = useQueryClient()
  // 예약 시각이 됐/지났으면 [진료 대기]가 추천(딥틸), 아직 일찍이면 [도착]이 추천 — 자리는 고정, 색만 옮긴다.
  const reached = row.slot_time ? row.slot_time.slice(0, 5) <= nowHHMM() : true

  const toArrived = useMutation({
    mutationFn: () => transitionStatus(row.appointment_id, { new_status: '도착', expected_updated_at: row.updated_at }),
    onSuccess: onChanged,
  })
  // ARRIVE-02: [진료 대기]는 바로 진료대기로. 백엔드 전이표는 예약확정→도착→진료대기라 도착을 거쳐 잇는다
  // (둘 다 이미 허용된 전이). 중간 도착 상태의 최신 updated_at을 다시 읽어 낙관잠금을 잇는다.
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
      <Btn variant={reached ? 'primary' : 'outline'} disabled={busy} onClick={() => toWaiting.mutate()}>진료 대기</Btn>
      <Btn variant={reached ? 'outline' : 'primary'} disabled={busy} onClick={() => toArrived.mutate()}>도착</Btn>
      {/* QUEUE-BTN-06: [번호 보기]는 미도착 탭에만 — 그 줄에서 인라인 펼침(MASK-VIEW-01·02). */}
      <Btn onClick={() => reveal(row)}>번호 보기</Btn>
    </>
  )
}

/** 도착(보류) 줄에서 직원이 앞당겨 진료 대기로 넣는다(QUEUE-BTN-02). */
function ToWaitingButton({ row, onChanged }: { row: QueueRow; onChanged: () => void }) {
  const mutation = useMutation({
    mutationFn: () => transitionStatus(row.appointment_id, { new_status: '진료대기', expected_updated_at: row.updated_at }),
    onSuccess: onChanged,
  })
  return <Btn variant="primary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>진료 대기</Btn>
}

/** 한 칸 되돌리기(UNDO-BTN-01) — 도착→예약확정, 진료대기→도착. 접수 구간이라 사유·확인창 없다(UNDO-WHY-03).
 *  순번은 지우지 않고 보관해 다시 넣으면 원래 자리로 돌아간다(UNDO-ORDER-01, 서버가 queue_position 유지). */
function UndoButton({ row, onChanged }: { row: QueueRow; onChanged: () => void }) {
  const mutation = useMutation({
    mutationFn: () => undoStatus(row.appointment_id),
    onSuccess: onChanged,
  })
  return <Btn variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate()}>되돌리기</Btn>
}

// ── 전체 탭 「상태별」 묶기(QUEUE-TAB-09·10·ORDER-10) ──────────────────────────

function GroupedList({ rows, state }: {
  rows: QueueRow[]
  state: {
    phones: Record<string, string>
    reveal: (row: QueueRow) => void
    navigate: NavigateFunction
    onChanged: () => void
    setUrgFor: (v: { row: QueueRow; turningOn: boolean }) => void
    highlightId: string | null
  }
}) {
  return (
    <div className="flex flex-col gap-3">
      {TABS.filter((t) => t.key !== 'total').map((t) => {
        const members = rows.filter((r) => tabForStatus(r.status) === t.key)
        if (members.length === 0) return null
        return (
          <div key={t.key} className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
            <div className="flex items-center gap-2 border-b border-border/70 px-4 py-2">
              <span className={`h-2.5 w-2.5 rounded-full ${STATUS_TONE[t.key]}`} />
              <h3 className="text-sm font-semibold">{t.label}</h3>
              <span className="text-xs font-medium tabular-nums text-muted-foreground">{members.length}</span>
              {t.key === 'waiting' && (
                <span className="ml-auto text-xs text-muted-foreground">순서는 「진료 대기」 탭에서 바꿉니다</span>
              )}
            </div>
            <div>
              {members.map((r, i) => (
                <RowNode
                  key={r.appointment_id}
                  row={r}
                  index={i}
                  tab="total"
                  showBadge={false}
                  highlighted={r.appointment_id === state.highlightId}
                  phones={state.phones}
                  reveal={state.reveal}
                  navigate={state.navigate}
                  onChanged={state.onChanged}
                  setUrgFor={state.setUrgFor}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── 빈 상태 ───────────────────────────────────────────────────────────────────

function QueueEmpty({ tab, filtered }: { tab: QueueTab; filtered: boolean }) {
  // QUEUE-WALK-01: 빈 상태에서도 화면 안에 등록 버튼을 다시 놓지 않는다 — 헤더 「＋ 등록」을 가리킨다.
  const hint = filtered
    ? '이 의사의 해당 상태 환자가 없습니다'
    : tab === 'waiting'
      ? '대기 중인 환자가 없습니다. 당일 방문은 위쪽 「＋ 등록」으로 받습니다'
      : '해당 상태의 환자가 없습니다'
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
      <div className="px-5 py-16 text-center text-muted-foreground">
        <EmptyState kind="zero" message={hint} />
      </div>
    </div>
  )
}

// ── 응급/주의 표시 확인 팝업(QUEUE-URG-02~05) ─────────────────────────────────

function UrgentDialog({ row, turningOn, onClose, onDone }: {
  row: QueueRow; turningOn: boolean; onClose: () => void; onDone: () => void
}) {
  const mutation = useMutation({
    mutationFn: () => setUrgentFlag(row.appointment_id, { is_urgent: turningOn, expected_updated_at: row.updated_at }),
    onSuccess: onDone,
  })
  return (
    <Modal onClose={onClose} title={turningOn ? '응급/주의로 표시합니다' : '응급/주의 표시를 끕니다'}>
      {/* QUEUE-URG-03·04: 의학적 판정이 아니며 순서가 바뀌지 않음을 화면에 그대로 띄운다. */}
      <p className="text-sm text-foreground/80">
        이 표시는 먼저 봐야 할 환자를 눈에 띄게 하는 것일 뿐, <b>의학적 응급도 판정이 아닙니다.</b>
      </p>
      <p className="mt-2 text-sm text-foreground/80">표시해도 <b>대기 순서는 바뀌지 않습니다.</b></p>
      {/* QUEUE-URG-06: 끌 때 「누가 언제 켰는지」를 보여준다 — 다른 직원이 이유가 있어 켠 것을
          모르고 끄는 일을 막는다. 대기 목록은 당일만이라 「오늘」로 고정한다. */}
      {!turningOn && row.urgent_flagged_by_name && row.urgent_flagged_at && (
        <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm text-foreground/75">
          오늘 <span className="tabular-nums">{hospitalHHMM(new Date(row.urgent_flagged_at))}</span> · <b>{row.urgent_flagged_by_name}</b> 님이 켰습니다
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Btn variant="outline" onClick={onClose}>취소</Btn>
        <Btn variant="primary" disabled={mutation.isPending} onClick={() => { if (!mutation.isPending) mutation.mutate() }}>
          {mutation.isPending ? '처리 중…' : '확인'}
        </Btn>
      </div>
    </Modal>
  )
}

// ── 순서 변경 사유 팝업(QUEUE-ORDER-05~09) ────────────────────────────────────

function ReorderDialog({ row, from, to, onClose, onDone }: {
  row: QueueRow; from: number; to: number; onClose: () => void; onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const mutation = useMutation({
    mutationFn: () => reorderQueue(row.appointment_id, { new_position: to, reason }),
    onSuccess: onDone,
  })
  return (
    <Modal title="대기 순서 변경" hideClose>
      <p className="text-sm text-foreground/80">
        <b>{row.name}</b> 님의 대기 순서를 <b>{from}번 → {to}번</b>으로 변경합니다.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">바꾼 사람과 이유가 기록에 남습니다</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="순서를 바꾸는 이유"
        rows={2}
        className="mt-3 w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
      />
      <div className="mt-4 flex justify-end gap-2">
        <Btn variant="outline" onClick={onClose}>취소</Btn>
        <button
          type="button"
          disabled={!reason.trim() || mutation.isPending}
          onClick={() => mutation.mutate()}
          className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {mutation.isPending ? '처리 중…' : '변경 확인'}
        </button>
      </div>
    </Modal>
  )
}

// ── 팝업 껍데기(PANEL-USE-02: 가운데 팝업) ────────────────────────────────────

function Modal({ title, children, onClose, hideClose }: {
  title: string; children: React.ReactNode; onClose?: () => void; hideClose?: boolean
}) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-[var(--elevation-card)]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          {!hideClose && onClose && (
            <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-muted" aria-label="닫기">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}

// ── 유틸 ──────────────────────────────────────────────────────────────────────

function labelFor(tab: QueueTab): string {
  return TABS.find((t) => t.key === tab)?.label ?? '대기'
}

/** 대기시간 문구는 상태마다 다르다(QUEUE-ROW-06): 도착은 「N분 경과」(줄서기 전이라 「대기」라 부르면
 *  순번이 있는 것처럼 읽힌다), 진료대기는 「N분 대기」, 진료중은 「N분째」. */
function waitLabel(status: string, minutes: number): string {
  if (status === '도착') return `${minutes}분 경과`
  if (status === '진료중') return `${minutes}분째`
  return `${minutes}분 대기`
}
