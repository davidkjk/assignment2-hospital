import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, X } from '@/components/icons'
import {
  QUEUE_TABS,
  maskBirth,
  queueCount,
  queuePatients,
  waitLabel,
  type QueuePatient,
  type QueueStatus,
} from '../mockData'

// 대기 목록 (/queue) — QUEUE-*.
// 오늘 예약 환자 전부를 상태 탭 7개로(한 번에 하나). 순번은 '진료 대기' 탭만.
// 진료중 전이는 의사가 여는 순간 자동이라 접수용 상태변경 버튼은 없다(DOCTOR-START-01/QUEUE-BTN-03).

const LONG_WAIT = 30 // long_wait_threshold_minutes 기본값

const STATUS_LABEL: Record<QueueStatus, string> = {
  not_arrived: '아직 안 옴',
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

  // 진료 대기 순서(로컬) — 드래그로 바꾼다. id 순서 배열.
  const [waitingOrder, setWaitingOrder] = useState<string[]>(() =>
    queuePatients.filter((p) => p.status === 'waiting').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((p) => p.id),
  )
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [emergency, setEmergency] = useState<Record<string, boolean>>(
    () => Object.fromEntries(queuePatients.filter((p) => p.emergency).map((p) => [p.id, true])),
  )
  const [urgFor, setUrgFor] = useState<{ p: QueuePatient; turningOn: boolean } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [reorder, setReorder] = useState<{ name: string; from: number; to: number; next: string[] } | null>(null)
  const [reason, setReason] = useState('')

  const byId = useMemo(() => new Map(queuePatients.map((p) => [p.id, p])), [])

  // 현재 탭에 보일 목록
  const rows: QueuePatient[] =
    activeTab === 'all'
      ? [...queuePatients].sort((a, b) => a.apptTime.localeCompare(b.apptTime))
      : activeTab === 'waiting'
        ? waitingOrder.map((id) => byId.get(id)!).filter(Boolean)
        : queuePatients.filter((p) => p.status === activeTab)

  function setTab(key: string) {
    setParams(key === 'waiting' ? {} : { tab: key })
  }

  // ── 드래그 순서 변경 (진료 대기 탭만) ──
  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return setDragId(null)
    const cur = [...waitingOrder]
    const from = cur.indexOf(dragId)
    const to = cur.indexOf(targetId)
    if (from < 0 || to < 0) return setDragId(null)
    cur.splice(from, 1)
    cur.splice(to, 0, dragId)
    setReorder({ name: byId.get(dragId)!.name, from: from + 1, to: to + 1, next: cur })
    setReason('')
    setDragId(null)
  }

  function statusButtons(p: QueuePatient) {
    const detail = <Btn key="d" onClick={() => navigate(`/staff/patients/${p.id}`)}>환자 상세</Btn>
    switch (p.status) {
      case 'not_arrived':
        return [
          <Btn key="a" variant="primary" onClick={() => navigate('/staff/checkin')}>도착 처리</Btn>,
          <Btn key="t" onClick={() => setRevealed((s) => new Set(s).add(p.id))}>번호 보기</Btn>,
        ]
      case 'arrived':
        return [<Btn key="w" variant="primary" onClick={() => {}}>진료 대기로</Btn>, detail]
      case 'waiting': {
        const on = emergency[p.id]
        return [
          <Btn key="u" variant="outline" onClick={() => setUrgFor({ p, turningOn: !on })}>
            {on ? '응급/주의 해제' : '응급/주의 표시'}
          </Btn>,
          detail,
        ]
      }
      case 'in_progress':
      case 'done':
        return [detail]
      case 'cancelled':
        return [<Btn key="r" variant="outline" onClick={() => navigate('/staff/calendar')}>재예약</Btn>, detail]
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-5">
      {/* ── 상태 탭 7개 (같은 너비, 한 번에 하나) ── */}
      <div className="mb-4 flex gap-1 rounded-xl border border-border/70 bg-card p-1 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
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
              <span className={`text-xs tabular-nums ${on ? 'text-primary-foreground/80' : 'text-muted-foreground/70'}`}>
                {queueCount(t.key)}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── 목록 ── */}
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
        {rows.length === 0 ? (
          <div className="px-5 py-16 text-center text-muted-foreground">
            <p className="font-medium">{STATUS_LABEL[activeTab as QueueStatus] ?? '해당'} 상태의 환자가 없습니다</p>
            <p className="mt-1 text-sm">예약 없이 오신 환자는 오른쪽 위 [＋ 당일 방문]으로 등록하세요</p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {rows.map((p, i) => {
              const isWaitingTab = activeTab === 'waiting'
              const emg = emergency[p.id]
              const wl = waitLabel(p)
              const longWait = (p.waitMin ?? 0) >= LONG_WAIT && (p.status === 'waiting' || p.status === 'arrived')
              return (
                <div
                  key={p.id}
                  draggable={isWaitingTab}
                  onDragStart={() => setDragId(p.id)}
                  onDragOver={(e) => isWaitingTab && e.preventDefault()}
                  onDrop={() => isWaitingTab && onDrop(p.id)}
                  className={`relative flex h-[52px] items-center gap-3 pl-4 pr-3 ${
                    emg ? 'border-l-4 border-amber-500' : ''
                  } ${dragId === p.id ? 'opacity-40' : ''} ${isWaitingTab ? 'cursor-grab active:cursor-grabbing' : ''}`}
                >
                  {/* 순번(진료대기) / 예약시각(아직 안 옴) / 빈칸 (QUEUE-ORDER-02·ROW-10) */}
                  <div className="w-12 shrink-0 text-right">
                    {isWaitingTab ? (
                      <span className="font-bold text-primary tabular-nums">
                        {i + 1}
                        <span className="ml-0.5 text-xs font-normal text-muted-foreground">번</span>
                      </span>
                    ) : p.status === 'not_arrived' ? (
                      <span className="text-sm tabular-nums text-foreground/70">{p.apptTime}</span>
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

                  {/* 전체 탭: 상태 배지 (진료대기면 순번 함께) */}
                  {activeTab === 'all' && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium text-white ${STATUS_TONE[p.status]}`}
                    >
                      {STATUS_LABEL[p.status]}
                      {p.status === 'waiting' && p.order ? ` · ${p.order}번` : ''}
                      {p.status === 'cancelled' && p.cancelKind ? ` · ${p.cancelKind}` : ''}
                    </span>
                  )}

                  {/* 상태별 버튼 — 전체 탭도 줄마다 그 상태의 버튼 (QUEUE-BTN-08) */}
                  <div className="ml-auto flex shrink-0 items-center gap-1.5">{statusButtons(p)}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {activeTab === 'waiting' && rows.length > 0 && (
        <p className="mt-2 px-1 text-xs text-muted-foreground">
          줄을 끌어 순서를 바꿀 수 있습니다 · 바꾼 사람과 이유가 기록에 남습니다
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
                setEmergency((m) => ({ ...m, [urgFor.p.id]: urgFor.turningOn }))
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
                setWaitingOrder(reorder.next)
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
