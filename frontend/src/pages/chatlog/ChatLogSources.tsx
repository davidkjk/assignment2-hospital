import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText } from '../../components/icons'
import type { ChatLogApi, ChatLogSource } from '../../api/staffChatLog'

// 봇 답변 근거(CHATLOG-LIST-SOURCE) — 그 답변이 쓴 승인 근거 자료를 보여준다(SOURCE-01).
// 근거가 없으면 '근거 자료 없음'으로 표시하고 있던 것처럼 꾸미지 않는다(SOURCE-02, 정본 §0).
// 근거 조회가 실패하면 봇 답변은 유지하고 근거 영역에만 오류+재시도(SOURCE-03).
// [상세 보기]는 상담 원문·AI 답변·근거를 별도 전체 화면으로 열고 복귀 시 직전 위치를 복원한다(DETAIL-01 → NAV-STFSUP-13).
// 시각 뼈대 = 데모 chatlog TurnView의 '답변 근거' 박스.

type Phase = 'loading' | 'ready' | 'error'

export interface OpenDetail {
  messageId: string
  fullscreen: true
  restoreKey?: string
}

export function ChatLogSources({
  api,
  messageId,
  onOpenDetail,
  restoreKey,
}: {
  api: ChatLogApi
  messageId: string
  onOpenDetail?: (d: OpenDetail) => void
  restoreKey?: string
}) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [sources, setSources] = useState<ChatLogSource[]>([])
  const apiRef = useRef(api)
  apiRef.current = api

  const load = useCallback(async () => {
    setPhase('loading')
    try {
      const s = await apiRef.current.listSources(messageId)
      setSources(s)
      setPhase('ready')
    } catch {
      setPhase('error') // SOURCE-03: 근거 영역에만 오류
    }
  }, [messageId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="mt-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5">
      <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        <FileText className="h-3 w-3" /> 답변 근거
      </div>

      {phase === 'error' ? (
        <div className="mt-0.5">
          <p className="text-xs text-muted-foreground">근거를 불러오지 못했습니다</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-1 rounded-md border border-border px-2 py-0.5 text-xs font-medium hover:bg-muted"
          >
            다시 시도
          </button>
        </div>
      ) : phase === 'loading' ? (
        <p className="mt-0.5 text-xs text-muted-foreground">근거 불러오는 중…</p>
      ) : sources.length > 0 ? (
        <ul className="mt-0.5 space-y-0.5">
          {sources.map((s) => (
            <li key={`${s.rank}-${s.titleSnapshot}`} className="text-xs">
              <span aria-hidden="true">· </span>
              <span>{s.titleSnapshot}</span>
            </li>
          ))}
        </ul>
      ) : (
        // SOURCE-02: 근거가 없으면 있던 것처럼 꾸미지 않는다.
        <p className="mt-0.5 text-xs text-muted-foreground">근거 자료 없음</p>
      )}

      {onOpenDetail && (
        <button
          type="button"
          onClick={() => onOpenDetail({ messageId, fullscreen: true, restoreKey })}
          className="mt-1 text-xs font-medium text-primary hover:underline"
        >
          상세 보기
        </button>
      )}
    </div>
  )
}
