import { ShieldCheck, Sparkles, X } from '@/components/icons'
import { ChatEngine } from '@/components/chatbot/ChatEngine'
import { bookingSheetScript } from '@/components/chatbot/scripts'
import { departments } from '@/mock/data'
import type { Department } from '@/mock/types'

// 예약 흐름 「어느 과인지 모르겠어요」에서 열리는 상담봇 시트(정본 BOOK-BOT-*).
// 제한 모드: 정보성 안내 + 진료과 추천만, 유일한 출구는 `○○과로 계속하기`(BOOK-BOT-07).
// 마법사를 끊지 않고, 고른 진료과를 그대로 예약 2단계에 채운 뒤 다음 단계로 이어간다.
export function DeptBotSheet({
  onClose,
  onPick,
}: {
  onClose: () => void
  onPick: (dept: Department) => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI 상담봇 진료과 안내"
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="flex h-[85vh] max-h-[720px] w-full max-w-[374px] flex-col overflow-hidden rounded-3xl bg-background shadow-2xl">
        <header className="flex items-center gap-2 bg-primary px-4 py-3 text-primary-foreground">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold leading-tight">AI 상담봇</p>
            <p className="text-xs text-primary-foreground/80">진료과 선택을 돕고 있어요</p>
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="-mr-1 rounded-full p-1.5 hover:bg-white/15"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex items-center gap-2 border-b bg-primary/5 px-4 py-2 text-xs text-primary/90">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>진단이 아닌 진료과 안내예요. 최종 선택은 직접 확인해 주세요.</span>
        </div>

        <ChatEngine
          script={bookingSheetScript}
          onDeptChosen={(deptId) => {
            const dept = departments.find((d) => d.id === deptId)
            if (dept) onPick(dept)
          }}
        />
      </div>
    </div>
  )
}
