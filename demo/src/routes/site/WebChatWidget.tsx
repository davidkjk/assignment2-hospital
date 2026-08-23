import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LockKeyhole, MessageCircle, ShieldCheck, Sparkles, X } from '@/components/icons'
import { ChatEngine, type ChatEngineHandle } from '@/components/chatbot/ChatEngine'
import { webScript } from '@/components/chatbot/scripts'

// 병원 홈페이지에 붙는 웹 상담창(요구사항 5.1). 우하단에 떠 있는 버튼 → 패널이 열린다.
// 익명 방문자용이라 병원 안내·진료과 추천까지는 로그인 없이, 예약 실행 같은 로그인 필요
// 행동은 위젯 위에 인증 모달을 띄우고(WEBMOD-AUTH-01), 로그인 성공 후 대화 맥락 그대로
// 예약 확인으로 복귀한다(WEBMOD-AUTH-07·WEBCHAT-ROOM-10).
export function WebChatWidget() {
  const [open, setOpen] = useState(false)
  const [authGate, setAuthGate] = useState<{ deptName: string; resumeTo: string } | null>(null)
  const engineRef = useRef<ChatEngineHandle>(null)
  const navigate = useNavigate()

  // 데모 로그인/가입 = 즉시 성공으로 보고 원래 예약 행동으로 복귀.
  const completeAuth = () => {
    const resumeTo = authGate?.resumeTo
    setAuthGate(null)
    if (resumeTo) engineRef.current?.goTo(resumeTo)
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="animate-chat-in fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-primary px-5 py-3.5 font-bold text-primary-foreground shadow-2xl transition-transform hover:scale-105"
        >
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
          AI 상담봇
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="AI 상담봇"
          className="animate-chat-in fixed bottom-5 right-5 z-30 flex h-[min(600px,80vh)] w-[min(384px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-3xl bg-background shadow-2xl ring-1 ring-black/10"
        >
          <header className="flex items-center gap-2 bg-primary px-4 py-3 text-primary-foreground">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold leading-tight">AI 상담봇</p>
              <p className="text-xs text-primary-foreground/80">병원 이용과 진료과를 안내해 드려요</p>
            </div>
            <button
              type="button"
              aria-label="닫기"
              onClick={() => setOpen(false)}
              className="-mr-1 rounded-full p-1.5 hover:bg-white/15"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="flex items-center gap-2 border-b bg-primary/5 px-4 py-2 text-xs text-primary/90">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>진단이나 처방이 아닌 진료과·병원 이용 안내예요.</span>
          </div>

          {/* 상담 맥락은 그대로 두고(WEBCHAT-ROOM-10), 인증 모달만 위에 겹친다. */}
          <div className="relative flex min-h-0 flex-1 flex-col">
            <ChatEngine
              ref={engineRef}
              script={webScript}
              onNavigate={(to) => navigate(to)}
              onAuthRequired={(payload) => setAuthGate(payload)}
            />

            {authGate && (
              <div className="absolute inset-0 z-10 flex items-end justify-center bg-black/40 p-4">
                <div className="animate-chat-in w-full rounded-2xl bg-card p-5 shadow-2xl">
                  <p className="flex items-center gap-1.5 text-base font-bold text-foreground">
                    <LockKeyhole className="h-5 w-5 text-primary" aria-hidden="true" /> 로그인이 필요해요
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {authGate.deptName} 예약을 진행하려면 로그인하거나 회원가입해 주세요. 지금까지 나눈
                    상담 내용은 그대로 이어집니다.
                  </p>
                  <div className="mt-4 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={completeAuth}
                      className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
                    >
                      로그인
                    </button>
                    <button
                      type="button"
                      onClick={completeAuth}
                      className="w-full rounded-xl border border-primary/40 bg-primary/5 py-3 text-sm font-bold text-primary transition-colors hover:bg-primary/10"
                    >
                      회원가입
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthGate(null)}
                      className="w-full py-1.5 text-sm text-muted-foreground hover:text-foreground"
                    >
                      나중에 할게요
                    </button>
                  </div>
                  <p className="mt-3 text-center text-xs text-muted-foreground/80">
                    데모 · 실제로는 로그인·회원가입 화면으로 이어집니다
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
