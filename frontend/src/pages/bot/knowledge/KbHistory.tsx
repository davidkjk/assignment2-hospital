import { useEffect, useState } from 'react'
import { btnGhost } from '../../../components/staff-ui'
import type { KbAdminApi, KbRevision } from '../../../api/kbAdmin'

// 수정이력(KBADM-HISTORY-01~09) — 선택 자료 한 건의 이전 내용·수정 기록을 최신 시각부터 읽기 전용으로 보인다.
// ⭐ 정정은 이전 버전 [편집]→편집 폼 prefill→다시 승인(A2) — 되돌리기·승인 취소·자동 복원이 아니다.
// ⭐ 기록에 없는 사유·승인자를 지어내지 않고, 0건↔조회 실패↔대상 없음(404)을 각각 구분한다.

export interface KbEditRevisionTarget {
  prefillFrom: string
  asNewDraft: true
  title: string
  content: string
}

type Phase = 'loading' | 'ready' | 'empty' | 'error' | 'notfound'

export interface KbHistoryProps {
  api: KbAdminApi
  docId: string
  onEditRevision: (target: KbEditRevisionTarget) => void
  onBackToList?: () => void
}

export function KbHistory({ api, docId, onEditRevision, onBackToList }: KbHistoryProps) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [revs, setRevs] = useState<KbRevision[]>([])

  const load = () => {
    setPhase('loading')
    api
      .listRevisions(docId)
      .then((rows) => {
        // 최신 시각부터. 현재 자료 한 건의 이력만(listRevisions(docId)) — 다른 자료를 섞지 않는다.
        const sorted = [...rows].sort((a, b) => b.at.localeCompare(a.at))
        setRevs(sorted)
        setPhase(sorted.length === 0 ? 'empty' : 'ready')
      })
      .catch((err: unknown) => {
        const status = (err as { status?: number } | null)?.status
        setPhase(status === 404 ? 'notfound' : 'error') // 대상 없음(404)과 조회 실패를 구분
      })
  }

  useEffect(load, [api, docId])

  return (
    <div data-testid="kb-history" data-doc={docId} className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        {phase === 'loading' && (
          <div aria-label="이력 로딩" className="flex flex-col items-center gap-2 px-6 py-16 text-center text-sm text-muted-foreground">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
            수정이력을 불러오는 중…
          </div>
        )}

        {phase === 'empty' && (
          <p className="px-6 py-16 text-center text-sm text-muted-foreground">이전 수정이력이 없습니다</p>
        )}

        {phase === 'error' && (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <p className="text-sm font-medium">수정이력을 불러오지 못했습니다</p>
            <button className={btnGhost} onClick={load}>
              다시 시도
            </button>
          </div>
        )}

        {phase === 'notfound' && (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <p className="text-sm font-medium">자료를 찾을 수 없습니다</p>
            <p className="text-xs text-muted-foreground">이 자료가 목록에서 사라졌을 수 있습니다.</p>
            <button className={btnGhost} onClick={() => onBackToList?.()}>
              목록으로 돌아가기
            </button>
          </div>
        )}

        {phase === 'ready' && (
          <ul className="space-y-2">
            {revs.map((r) => (
              <li key={r.id} data-testid="kb-rev" className="rounded-xl border border-border/70 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{r.title || '(제목 없음)'}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                      {r.at}
                      {r.approvedBy && <span> · 승인자: {r.approvedBy}</span>}
                    </div>
                  </div>
                  <button
                    className={`${btnGhost} shrink-0 px-2.5 py-1`}
                    onClick={() => onEditRevision({ prefillFrom: r.id, asNewDraft: true, title: r.title, content: r.content })}
                  >
                    편집
                  </button>
                </div>
                {/* 읽기 전용 스냅샷 — 그 시점 내용을 그대로 보인다(수정 불가) */}
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/40 px-3 py-2 text-sm">{r.content}</p>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  이 버전을 [편집]하면 편집기에 채워집니다. 확인·수정 후 <b>다시 승인</b>해야 반영됩니다(되돌리기·자동 복원이 아닙니다).
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
