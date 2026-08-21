import { MessageCircle, Send, Sparkles } from 'lucide-react'
import { PhoneFrame } from '@/components/PhoneFrame'

// AI 상담 탭(하단 탭 5번째). 상담봇은 별도 트랙이라 데모에서는 시작 화면 목업만 둔다.
const QUICK_QUESTIONS = [
  '어느 진료과로 가야 할까요?',
  '예약을 바꾸고 싶어요',
  '병원 위치가 궁금해요',
]

export function Chat() {
  return (
    <PhoneFrame>
      <div data-testid="chat" className="flex h-full flex-col">
        <header className="flex items-center gap-2 border-b px-5 py-4">
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
          <h1 className="text-lg font-bold">AI 상담</h1>
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Sparkles className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
            </span>
            <p className="text-base font-semibold">무엇이든 물어보세요</p>
            <p className="text-sm text-muted-foreground">
              증상, 진료과 추천, 예약 변경 안내를 도와드립니다
            </p>
          </div>

          <div className="mt-8 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">이런 걸 물어볼 수 있어요</p>
            {QUICK_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                className="w-full rounded-xl border bg-card px-4 py-3 text-left text-sm hover:bg-muted"
              >
                {q}
              </button>
            ))}
          </div>
        </main>

        <footer className="border-t p-3">
          <div className="flex items-center gap-2 rounded-full border bg-muted px-4 py-2">
            <span className="flex-1 text-sm text-muted-foreground">메시지를 입력하세요</span>
            <Send className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </div>
        </footer>
      </div>
    </PhoneFrame>
  )
}
