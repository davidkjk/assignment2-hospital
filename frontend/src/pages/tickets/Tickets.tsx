import { useState, type ReactNode } from 'react'
import { StaffPage, Segmented } from '../../components/staff-ui'
import { EmptyState } from '../../components/EmptyState'
import { LoadingState } from '../../components/LoadingState'
import { staffChatApi, TicketClaimConflict, type StaffChatApi, type InboxTicket } from '../../api/staffChat'
import { useTicketInbox } from './useTicketInbox'
import { TicketRow } from './TicketRow'

// 상담봇 문의함 (/tickets) — TICKET-INBOX-*.
// 분할 화면: 왼쪽 상태 탭 3개 + 접수순 목록, 오른쪽 넓은 상세 작업공간.
// 새 문의(pending) 행 선택 = 원자 배정(claim). 서버가 승패를 정한다 — 승자는 상세를 열고,
// 패자는 목록을 유지한 채 「이미 다른 직원이 맡았어요」와 최신 담당자를 본다(프론트가 추측하지 않는다).
// ⚠️ 오른쪽 상세 내용은 Task 17(TICKET-DETAIL-*)이 detailSlot으로 채운다. 여기선 목록·배정·슬롯만.
// ⭐ 폐지된 취소요청 대기열(/cancellation-requests)은 만들지 않는다(SCOPE-01).

export function Tickets({
  api = staffChatApi,
  detailSlot,
}: {
  api?: StaffChatApi
  // 상세 슬롯(Task 17). 두 번째 인자로 목록 복귀 헬퍼를 준다 — OPEN-02/03 패자·404가 상세를 닫고 목록으로 돌아갈 때.
  detailSlot?: (t: InboxTicket | null, helpers: { backToList: (msg: string) => void }) => ReactNode
}) {
  const inbox = useTicketInbox(api)
  const [selected, setSelected] = useState<InboxTicket | null>(null)
  const [loserNotice, setLoserNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // 상세가 「목록으로 돌아가라」고 할 때(경쟁 패자·남의 in_progress·없는 티켓). 안내를 띄우고 목록을 최신화한다.
  const backToList = (msg: string) => {
    setSelected(null)
    setLoserNotice(msg || null)
    void inbox.retry()
  }

  const select = async (t: InboxTicket) => {
    setLoserNotice(null)
    if (t.status !== 'pending') {
      setSelected(t) // 처리중/답변완료 → 상세 슬롯 위임(Task 17). 배정하지 않는다.
      return
    }
    if (busy) return // 중복 claim 방지(BTN-BUSY)
    setBusy(true)
    try {
      const claimed = await api.claimTicket(t.id) // 원자 배정(서버가 승패 결정)
      setSelected(claimed) // 승자 → 오른쪽 상세 열기
      await inbox.retry() // 방금 맡은 티켓은 pending에서 빠진다 — realtime에만 기대지 않고 즉시 정합화
    } catch (e) {
      if (e instanceof TicketClaimConflict) {
        setLoserNotice('이미 다른 직원이 맡았어요.') // 패자 → 목록 유지 + 최신 담당자
        await inbox.retry()
      } else {
        setLoserNotice('배정하지 못했습니다. 잠시 후 다시 시도해주세요.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <StaffPage max="max-w-full" testid="staff-tickets" footer={false}>
      <div className="flex gap-4" style={{ height: 'calc(100vh - 11rem)' }}>
        {/* 왼쪽: 상태 탭 + 접수순 목록. 탭바는 왼쪽 위에만 단독으로 두고, 오른쪽 상세 카드 윗선은 아래 '문의 목록' 첫 카드에 맞춘다. */}
        <div className="flex w-96 shrink-0 flex-col">
          {/* Q25: 부모 flex-col이 Segmented(inline-flex)를 교차축(가로)으로 stretch해 탭바가 w-96 전폭을
              채우고 '답변 완료' 오른쪽에 회색 빈 영역이 길게 남았다 → self-start로 내용 폭만 차지하게 한다. */}
          <div className="self-start">
            <Segmented
              options={inbox.tabs}
              value={inbox.tab}
              onChange={(k) => inbox.setTab(k)}
              count={(k) => inbox.counts[k]}
            />
          </div>
          {loserNotice && (
            <p role="alert" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {loserNotice}
            </p>
          )}
          {/* 목록 전체를 하나의 카드로(오른쪽 상세와 같은 프레임) — 위아래로 떠 있던 개별 행 대신 한 카드
              안에서 스크롤한다(사용자 결정 2026-09-09). 윗선은 탭바(h-9)+mt-2로 오른쪽 상세 카드와 맞춘다. */}
          <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-panel">
            <div className="min-h-0 flex-1 overflow-y-auto">
              {inbox.phase === 'loading' && (
                <div className="p-3"><LoadingState variant="card" message="문의를 불러오는 중입니다" /></div>
              )}
              {inbox.phase === 'blocked' && (
                <p role="status" className="px-3 py-6 text-center text-sm text-muted-foreground">
                  상담 문의 기능이 아직 준비 중입니다
                </p>
              )}
              {inbox.phase === 'error' && (
                <div className="p-3"><EmptyState kind="error" onRetry={inbox.retry} /></div>
              )}
              {inbox.phase === 'empty' && (
                <div className="p-3">
                  <EmptyState kind="zero" message={`${inbox.tabs.find((t) => t.key === inbox.tab)?.label} 문의가 없습니다`} />
                </div>
              )}
              {inbox.phase === 'ready' && (
                <>
                  {inbox.partialError && (
                    <p role="alert" className="m-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      목록을 새로 고치지 못했습니다 · 이전 기준으로 보여줍니다
                    </p>
                  )}
                  {/* 행 사이는 구분선으로(플랫 목록, 사용자 결정) — 개별 카드 테두리를 두지 않는다. */}
                  <ul className="divide-y divide-border/60">
                    {inbox.tickets.map((t) => (
                      <TicketRow key={t.id} ticket={t} active={t.id === selected?.id} onSelect={select} />
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 오른쪽: 상세 작업공간 (내용 = Task 17이 detailSlot으로 채운다).
            윗선을 왼쪽 '문의 목록' 첫 카드와 맞춘다 — 탭바(h-9=36px) 높이만큼 비우고 목록과 같은 mt-2 간격을 준다. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div aria-hidden className="h-9 shrink-0" />
          <div
            aria-label="상세 작업공간"
            className="mt-2 min-h-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]"
          >
            {detailSlot ? (
              detailSlot(selected, { backToList })
            ) : (
              <DefaultRightPane selected={selected} />
            )}
          </div>
        </div>
      </div>
    </StaffPage>
  )
}

// Task 17이 아직 detailSlot을 꽂기 전의 기본 오른쪽 — 선택 전엔 안내, 선택 후엔 상세가 다음 단계임을 알린다.
function DefaultRightPane({ selected }: { selected: InboxTicket | null }) {
  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        왼쪽에서 문의를 고르면 대화와 인계 요약이 여기에 열립니다
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center">
      <p className="text-sm font-medium">{selected.patientQuestion}</p>
      <p className="text-sm text-muted-foreground">상세 작업공간은 다음 단계에서 열립니다</p>
    </div>
  )
}
