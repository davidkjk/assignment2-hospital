import { MessageCircle, Send, Sparkles } from '@/components/icons'
import { useLocation } from 'react-router-dom'
import { PhoneFrame } from '@/components/PhoneFrame'
import { ScreenHeader } from '@/components/ScreenHeader'

// AI 상담 탭(하단 탭 5번째). 상담봇은 별도 트랙이라 데모에서는 시작 화면 목업만 둔다.
// 단, 예약 취소 마감 후 연결(CANCEL-LATE-10)로 들어오면 봇이 예약 정보·연결 사실·
// 예약이 유지됨을 설명하는 첫 메시지를 보인다.
const QUICK_QUESTIONS = [
  '어느 진료과로 가야 할까요?',
  '예약을 바꾸고 싶어요',
  '병원 위치가 궁금해요',
]

type CancelContext = { context: 'cancel'; patientName: string; when: string; dept: string }

export function Chat() {
  const location = useLocation()
  const state = location.state as CancelContext | null
  const cancel = state?.context === 'cancel' ? state : null

  return (
    <PhoneFrame>
      <div data-testid="chat" className="flex h-full flex-col">
        <ScreenHeader title="AI 상담" icon={<MessageCircle className="h-5 w-5" />} />

        <main className="flex-1 overflow-y-auto px-5 py-6">
          {cancel ? (
            <div className="space-y-3" data-testid="chat-cancel-intro">
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm border bg-card px-4 py-3 text-sm shadow-sm">
                <p className="font-semibold text-primary">취소 상담이 연결됐어요</p>
                <p className="mt-1 text-muted-foreground">
                  {cancel.patientName} · {cancel.when} · {cancel.dept}
                </p>
                <p className="mt-2 leading-6">
                  직원이 예약을 확인하고 안내해 드릴 때까지{' '}
                  <b className="font-semibold text-foreground">예약은 그대로 유지</b>됩니다. 어떤 점이
                  궁금하신가요?
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center gap-3 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="h-7 w-7 text-primary" aria-hidden="true" />
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
                    className="w-full rounded-xl border bg-card px-4 py-3 text-left text-sm transition-colors hover:border-primary hover:bg-primary/5"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </>
          )}
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
