import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, X } from '@/components/icons'
import {
  NOW,
  QUEUE_TABS,
  maskBirth,
  queuePatients,
  waitLabel,
  type QueuePatient,
  type QueueStatus,
} from '../mockData'

// 대기 목록 (/queue) — QUEUE-*.
// 오늘 예약 환자 전부를 상태 탭 7개로(한 번에 하나). 순번은 '진료 대기' 탭만.
// 진료중 전이는 의사가 여는 순간 자동이라 접수용 상태변경 버튼은 없다(DOCTOR-START-01/QUEUE-BTN-03).
//
// 데모 상호작용(직접 세공):
// ① 드래그 순서변경 = 놓일 자리에 딥틸 삽입선 + 순번 칩(▸ N번 자리), 끌리는 줄은 점선 잔상(QUEUE-ORDER-04).
// ③ 상태 전이 시뮬레이션 = [도착 처리]·[진료 대기로]를 누르면 그 줄이 현재 탭에서 빠져나가고 탭 건수가 함께 바뀐다.

const LONG_WAIT = 30 // long_wait_threshold_minutes 기본값
const REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const STATUS_LABEL: Record<QueueStatus, string> = {
  not_arrived: '미도착',
  arrived: '도착',
  waiting: '진료 대기',
  in_progress: '진료 중',
  done: '진료 완료',
  cancelled: '취소·부도',
}
const STATUS_TONE: Record<QueueStatus, string> = {
  not_arrived: 'bg-slate-400',
  arrived: 'bg-violet-600',
  waiting: 'bg-sky-600',
  in_progress: 'bg-primary',
  done: 'bg-slate-500',
  cancelled: 'bg-amber-500',
}

// 탭별 정렬 — 목록 성격에 따라 방향이 뒤집힌다.
//  · 처리 대기 줄(미도착·도착·진료 대기)  = 오래된/이른 것이 위(시급성·공정성).
//  · 끝난 기록(진료 완료·취소·부도)            = 최신이 위(방금 끝난 것을 참조·후속조치).
// 근거: 진료 대기=QUEUE-ORDER-01(순번), 전체=QUEUE-TAB-09(시각순). 완료/취소 최신순은
//       정본이 다른 목록(PTDET-VISIT-03·SEND-LIST-07 등)에서 세운 최신순 패턴을 그대로 적용.
//       (완료/취소 시각을 따로 안 두는 데모라 예약 시각 역순을 최신순 대용으로 씀.)
function sortForTab(list: QueuePatient[], tab: QueueStatus | 'all'): QueuePatient[] {
  const rows = [...list]
  switch (tab) {
    case 'all':
      return rows.sort((a, b) => b.apptTime.localeCompare(a.apptTime)) // 최신(늦은 예약) 먼저 — 완료가 위에 쌓이지 않게
    case 'not_arrived':
    case 'in_progress':
      return rows.sort((a, b) => a.apptTime.localeCompare(b.apptTime))
    case 'arrived':
      return rows.sort((a, b) => a.apptTime.localeCompare(b.apptTime)) // 예약 시각 이른 순 — 자동 전환이 임박한 사람이 위
    case 'waiting':
      return rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) // 순번
    case 'done':
    case 'cancelled':
      return rows.sort((a, b) => b.apptTime.localeCompare(a.apptTime)) // 최신순
  }
}

function Btn({
  children,
  variant = 'ghost',
  onClick,
}: {
  children: React.ReactNode
  variant?: 'primary' | 'outline' | 'ghost'
  onClick?: () => void
}) {
  const styles = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    outline: 'border border-border bg-card hover:bg-muted',
    ghost: 'text-primary hover:bg-primary/8',
  }[variant]
  return (
    <button onClick={onClick} className={`h-9 rounded-md px-2.5 text-sm font-medium whitespace-nowrap transition-colors ${styles}`}>
      {children}
    </button>
  )
}

export function Queue() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const activeTab = (params.get('tab') as QueueStatus | 'all' | null) ?? 'waiting' // 기본 진료 대기 (QUEUE-TAB-03)
  const isWaitingTab = activeTab === 'waiting'

  // 환자 전체를 로컬 상태로 — 상태 전이/응급/순번을 눌러서 바꾼다(데모 시뮬레이션).
  const [patients, setPatients] = useState<QueuePatient[]>(() => queuePatients.map((p) => ({ ...p })))
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [urgFor, setUrgFor] = useState<{ p: QueuePatient; turningOn: boolean } | null>(null)
  const [reason, setReason] = useState('')
  const [leaving, setLeaving] = useState<Set<string>>(new Set()) // 탭에서 빠져나가는 중(퇴장 애니메이션)

  // 드래그 상태
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null) // 이 줄 '앞'에 삽입선. '__end__'=맨 끝
  const [reorder, setReorder] = useState<{ name: string; from: number; to: number; next: string[] } | null>(null)
  const [allGroup, setAllGroup] = useState<'time' | 'status'>('time') // 전체 탭 묶기 (QUEUE-TAB-09)

  // 파생값
  const count = (key: QueueStatus | 'all') =>
    key === 'all' ? patients.length : patients.filter((p) => p.status === key).length

  const waitingIds = useMemo(
    () =>
      patients
        .filter((p) => p.status === 'waiting')
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((p) => p.id),
    [patients],
  )
  const byId = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients])

  const rows: QueuePatient[] =
    activeTab === 'waiting'
      ? waitingIds.map((id) => byId.get(id)!).filter(Boolean)
      : sortForTab(patients.filter((p) => (activeTab === 'all' ? true : p.status === activeTab)), activeTab)

  function setTab(key: string) {
    setParams(key === 'waiting' ? {} : { tab: key })
  }

  // ── 상태 전이(③) — 그 줄을 퇴장시킨 뒤 상태를 바꾼다(탭에서 사라지고 건수가 바뀐다) ──
  function transition(id: string, apply: (p: QueuePatient) => QueuePatient) {
    const commit = () => {
      setPatients((ps) => ps.map((p) => (p.id === id ? apply(p) : p)))
      setLeaving((s) => {
        const n = new Set(s)
        n.delete(id)
        return n
      })
    }
    if (REDUCED_MOTION) return commit()
    setLeaving((s) => new Set(s).add(id))
    setTimeout(commit, 240)
  }
  const arrive = (id: string) => transition(id, (p) => ({ ...p, status: 'arrived', waitMin: 0 }))
  const toWaiting = (id: string) => {
    const p0 = patients.find((p) => p.id === id)
    // 되돌렸다 다시 진행하면 원래 순번으로(UNDO-ORDER-01), 처음이면 줄 맨 뒤
    const order = p0?.order ?? Math.max(0, ...patients.filter((p) => p.status === 'waiting').map((p) => p.order ?? 0)) + 1
    transition(id, (p) => ({ ...p, status: 'waiting', order, waitMin: 0 }))
  }
  // 되돌리기 — 한 칸 뒤로(UNDO-SCOPE-01), 접수직원 구간(UNDO-ROLE-01)
  const revertToNotArrived = (id: string) => transition(id, (p) => ({ ...p, status: 'not_arrived', waitMin: undefined }))
  const revertToArrived = (id: string) => transition(id, (p) => ({ ...p, status: 'arrived', waitMin: 0 })) // order 보관(UNDO-ORDER-01)

  // ── 드래그 순서 변경(①, 진료 대기 탭만) ──
  // targetId 앞에 dragId를 끼운 결과 배열
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
  // 삽입선 칩에 보일 순번(놓으면 몇 번이 되는지)
  function previewPos(targetId: string): number {
    return previewOrder(targetId).indexOf(dragId!) + 1
  }
  function onDrop(targetId: string) {
    if (!dragId) return
    const next = previewOrder(targetId)
    const from = waitingIds.indexOf(dragId) + 1
    const to = next.indexOf(dragId) + 1
    setDragId(null)
    setOverId(null)
    if (from === to) return // 자리 안 바뀜
    setReorder({ name: byId.get(dragId)!.name, from, to, next })
    setReason('')
  }

  // 삽입선 (딥틸 선 + 순번 칩) — 놓일 자리에 뜬다
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

  function statusButtons(p: QueuePatient) {
    const detail = <Btn key="d" onClick={() => navigate(`/staff/patients/${p.id}`)}>환자 상세</Btn>
    switch (p.status) {
      case 'not_arrived': {
        // 버튼 순서는 항상 [진료 대기][도착]으로 고정한다 — 줄마다 위치가 바뀌면 직원이 혼란(폰 검수 피드백).
        // 추천 동작만 색(딥틸)으로 표시하고 위치는 그대로: 예약 시각이 됐/지났으면 [진료 대기]가 딥틸,
        // 아직 일찍 오셨으면 [도착]이 딥틸. 시각 처리는 시스템이 맡는다 — 도착(보류)한 분은 예약 시각이
        // 되면 자동으로 진료 대기로 넘어간다(직원 재클릭 없음).
        const early = p.apptTime > NOW
        return [
          <Btn key="w" variant={early ? 'outline' : 'primary'} onClick={() => toWaiting(p.id)}>진료 대기</Btn>,
          <Btn key="a" variant={early ? 'primary' : 'outline'} onClick={() => arrive(p.id)}>도착</Btn>,
          <Btn key="t" onClick={() => setRevealed((s) => new Set(s).add(p.id))}>번호 보기</Btn>,
        ]
      }
      case 'arrived':
        // 일찍 오신 분(보류). 예약 시각이 되면 자동 전환 → [진료 대기]는 '지금 바로 넣기' 재량(딥틸 아님).
        return [
          <Btn key="w" variant="outline" onClick={() => toWaiting(p.id)}>진료 대기</Btn>,
          <Btn key="u" variant="outline" onClick={() => revertToNotArrived(p.id)}>되돌리기</Btn>,
          detail,
        ]
      case 'waiting':
        return [
          <Btn key="e" variant="outline" onClick={() => setUrgFor({ p, turningOn: !p.emergency })}>
            {p.emergency ? '응급/주의 해제' : '응급/주의 표시'}
          </Btn>,
          <Btn key="u" variant="outline" onClick={() => revertToArrived(p.id)}>되돌리기</Btn>,
          detail,
        ]
      case 'in_progress':
      case 'done':
        return [detail]
      case 'cancelled':
        return [<Btn key="r" variant="outline" onClick={() => navigate('/staff/calendar')}>재예약</Btn>, detail]
    }
  }

  // 한 줄 렌더 — 대기(드래그)·단일탭·전체(시각순/상태별 구획) 모두 재사용
  function RowNode(p: QueuePatient, i: number, showBadge: boolean) {
    const emg = p.emergency
    const wl = waitLabel(p)
    const longWait = (p.waitMin ?? 0) >= LONG_WAIT && (p.status === 'waiting' || p.status === 'arrived')
    const isLeaving = leaving.has(p.id)
    const isDragging = dragId === p.id
    return (
      <div
        key={p.id}
        draggable={isWaitingTab}
        onDragStart={isWaitingTab ? () => { setDragId(p.id); setOverId(p.id) } : undefined}
        onDragOver={isWaitingTab ? (e) => { e.preventDefault(); setOverId(p.id) } : undefined}
        onDrop={isWaitingTab ? () => onDrop(p.id) : undefined}
        onDragEnd={isWaitingTab ? () => { setDragId(null); setOverId(null) } : undefined}
        className={`relative flex h-[52px] items-center gap-3 pl-4 pr-3 transition-all duration-200 motion-reduce:transition-none ${
          i > 0 ? 'border-t border-border/60' : ''
        } ${emg ? 'border-l-4 border-l-amber-500' : ''} ${
          isLeaving ? 'pointer-events-none -translate-x-3 opacity-0' : ''
        } ${
          isDragging ? 'rounded-lg border border-dashed border-primary/50 bg-primary/[0.04] opacity-50' : ''
        } ${isWaitingTab && !isDragging ? 'cursor-grab active:cursor-grabbing' : ''}`}
      >
        {/* 순번(진료대기) / 예약시각(미도착) / 빈칸 (QUEUE-ORDER-02·ROW-10) */}
        <div className="w-12 shrink-0 text-right">
          {isWaitingTab ? (
            <span className="font-bold text-primary tabular-nums">
              {i + 1}
              <span className="ml-0.5 text-xs font-normal text-muted-foreground">번</span>
            </span>
          ) : p.status === 'not_arrived' ? (
            <span className="text-sm tabular-nums text-foreground/70">{p.apptTime}</span>
          ) : p.status === 'arrived' ? (
            // 예약 시각 = 자동으로 진료 대기로 넘어가는 시각
            <span className="text-sm tabular-nums text-violet-600">{p.apptTime}</span>
          ) : null}
        </div>

        {/* 이름 (+ 응급/당일방문 표식) */}
        <div className="flex w-40 shrink-0 items-center gap-1.5">
          <span className="font-semibold">{p.name}</span>
          {emg && (
            <span className="inline-flex items-center gap-0.5 text-xs font-bold text-amber-600">
              <AlertTriangle className="h-3 w-3" />응급
            </span>
          )}
          {p.walkIn && (
            <span className="rounded bg-muted px-1 py-0.5 text-[0.65rem] text-muted-foreground">당일</span>
          )}
        </div>

        {/* 생년월일 (마스킹) / 번호 펼침 */}
        <div className="w-32 shrink-0 text-sm text-muted-foreground">
          {revealed.has(p.id) && p.tel ? (
            <span className="font-medium text-foreground">{p.tel}</span>
          ) : (
            maskBirth(p.birth)
          )}
        </div>

        {/* 대기시간 (탭마다 문구 다름, ≥30분 주의색) */}
        <div className={`w-20 shrink-0 text-sm ${longWait ? 'font-semibold text-amber-600' : 'text-muted-foreground'}`}>
          {wl}
        </div>

        {/* 진료과/의사 */}
        <div className="hidden w-28 shrink-0 text-sm text-muted-foreground md:block">
          {p.dept} {p.doctor}
        </div>

        {/* 전체 탭 시각순: 상태 배지 (진료대기면 순번 함께) */}
        {showBadge && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium text-white ${STATUS_TONE[p.status]}`}>
            {STATUS_LABEL[p.status]}
            {p.status === 'waiting' && p.order ? ` · ${p.order}번` : ''}
            {p.status === 'cancelled' && p.cancelKind ? ` · ${p.cancelKind}` : ''}
          </span>
        )}

        {/* 상태별 버튼 — 전체 탭도 줄마다 그 상태의 버튼 (QUEUE-BTN-08) */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">{statusButtons(p)}</div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-5">
      {/* ── 상태 탭 7개 + (전체일 때) 묶기 토글을 같은 줄 오른쪽에 ── */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex flex-1 gap-1 rounded-xl border border-border/70 bg-card p-1 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
        {QUEUE_TABS.map((t) => {
          const on = activeTab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-1 py-2 text-sm font-medium transition-colors ${
                on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {t.label}
              <span className={`text-xs tabular-nums transition-all ${on ? 'text-primary-foreground/80' : 'text-muted-foreground/70'}`}>
                {count(t.key)}
              </span>
            </button>
          )
        })}
        </div>

        {/* 전체 탭: 묶기 토글(QUEUE-TAB-09)을 탭 줄 오른쪽에 — 완료·취소가 쌓이면 상태별이 낫다 */}
        {activeTab === 'all' && (
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

      {/* ── 목록 ── */}
      {activeTab === 'all' && allGroup === 'status' ? (
        // 상태별 묶기: 구획 머리 + 안 접음(QUEUE-TAB-10) · 완료·취소는 맨 아래로 가라앉는다 · 드래그 불가(QUEUE-ORDER-10)
        <div className="flex flex-col gap-3">
          {QUEUE_TABS.filter((t) => t.key !== 'all').map((t) => {
            const members = sortForTab(
              patients.filter((p) => p.status === t.key),
              t.key as QueueStatus,
            )
            if (members.length === 0) return null
            return (
              <div
                key={t.key}
                className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]"
              >
                <div className="flex items-center gap-2 border-b border-border/70 px-4 py-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${STATUS_TONE[t.key as QueueStatus]}`} />
                  <h3 className="text-sm font-semibold">{t.label}</h3>
                  <span className="text-xs font-medium tabular-nums text-muted-foreground">{members.length}</span>
                  {t.key === 'waiting' && (
                    <span className="ml-auto text-xs text-muted-foreground">순서는 「진료 대기」 탭에서 바꿉니다</span>
                  )}
                </div>
                <div>{members.map((p, i) => RowNode(p, i, false))}</div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          {rows.length === 0 ? (
            <div className="px-5 py-16 text-center text-muted-foreground">
              <p className="font-medium">{STATUS_LABEL[activeTab as QueueStatus] ?? '해당'} 상태의 환자가 없습니다</p>
              <p className="mt-1 text-sm">예약 없이 오신 환자는 오른쪽 위 [＋ 당일 방문]으로 등록하세요</p>
            </div>
          ) : (
            <div onDragOver={(e) => { if (isWaitingTab) e.preventDefault() }}>
              {rows.map((p, i) => (
                <div key={p.id}>
                  {isWaitingTab && <InsertBar targetId={p.id} />}
                  {RowNode(p, i, activeTab === 'all')}
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
          )}
        </div>
      )}

      {isWaitingTab && rows.length > 0 && (
        <p className="mt-2 px-1 text-xs text-muted-foreground">
          줄을 끌어 순서를 바꿀 수 있습니다 · 놓을 자리에 순번이 표시되고, 바꾼 사람과 이유가 기록에 남습니다
        </p>
      )}

      <p className="mt-5 text-center text-xs text-muted-foreground">데모 화면입니다 · 가짜 데이터로 정상 흐름을 보여 줍니다</p>

      {/* ── 응급/주의 확인 팝업 (QUEUE-URG-02~06) ── */}
      {urgFor && (
        <Modal onClose={() => setUrgFor(null)} title={urgFor.turningOn ? '응급/주의 표시할까요?' : '응급/주의 표시를 끌까요?'}>
          <p className="text-sm text-foreground/80">
            이 표시는 먼저 봐야 할 환자를 눈에 띄게 하는 것일 뿐, <b>의학적 응급도 판정이 아닙니다.</b>
          </p>
          <p className="mt-2 text-sm text-foreground/80">표시해도 <b>대기 순서는 바뀌지 않습니다.</b></p>
          {!urgFor.turningOn && urgFor.p.emergencyBy && (
            <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              {urgFor.p.emergencyBy} 님이 켰습니다
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Btn variant="outline" onClick={() => setUrgFor(null)}>취소</Btn>
            <Btn
              variant="primary"
              onClick={() => {
                const on = urgFor.turningOn
                setPatients((ps) =>
                  ps.map((p) =>
                    p.id === urgFor.p.id
                      ? { ...p, emergency: on, emergencyBy: on ? '방금 · 나' : undefined }
                      : p,
                  ),
                )
                setUrgFor(null)
              }}
            >
              {urgFor.turningOn ? '표시하기' : '표시 끄기'}
            </Btn>
          </div>
        </Modal>
      )}

      {/* ── 순서 변경 사유 팝업 (QUEUE-ORDER-05~08, 바깥 클릭으로 안 닫힘) ── */}
      {reorder && (
        <Modal title="대기 순서 변경" hideClose>
          <p className="text-sm text-foreground/80">
            <b>{reorder.name}</b> 님의 대기 순서를 <b>{reorder.from}번 → {reorder.to}번</b>으로 변경합니다.
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
            <Btn variant="outline" onClick={() => setReorder(null)}>취소</Btn>
            <button
              disabled={!reason.trim()}
              onClick={() => {
                // 새 순서대로 order 값을 다시 매긴다(1,2,3…)
                const pos = new Map(reorder.next.map((id, idx) => [id, idx + 1]))
                setPatients((ps) => ps.map((p) => (pos.has(p.id) ? { ...p, order: pos.get(p.id)! } : p)))
                setReorder(null)
              }}
              className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              변경 확인
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({
  title,
  children,
  onClose,
  hideClose,
}: {
  title: string
  children: React.ReactNode
  onClose?: () => void
  hideClose?: boolean
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-[var(--elevation-card)]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          {!hideClose && onClose && (
            <button onClick={onClose} className="rounded-full p-1 hover:bg-muted">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}
