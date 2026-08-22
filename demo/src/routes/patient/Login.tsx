import { useNavigate } from 'react-router-dom'
import { PhoneFrame } from '@/components/PhoneFrame'
import { Button } from '@/components/ui/button'

// 정본 묶음 1(screen-behaviors.md:2746~2992). 데모라 실제 인증/OTP는 생략하고
// [로그인]은 홈으로, [회원가입]은 네 단계 목업으로 진입시킨다.
export function Login() {
  const navigate = useNavigate()
  return (
    <PhoneFrame>
      <div
        data-testid="login-screen"
        className="flex h-full flex-col items-center justify-between px-8 py-16"
      >
        <div className="mt-16 flex flex-col items-center gap-3">
          <div className="brand-wordmark flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-3xl text-primary-foreground shadow-md">
            가
          </div>
          <h1 className="brand-wordmark text-3xl text-primary">가온병원</h1>
          <p className="text-sm text-muted-foreground">예약하고 대기 없이 진료받으세요</p>
        </div>

        <div className="flex w-full flex-col gap-3">
          <Button size="lg" className="h-12 w-full text-base" onClick={() => navigate('/login')}>
            로그인
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="h-12 w-full text-base"
            onClick={() => navigate('/signup')}
          >
            회원가입
          </Button>
          <button
            type="button"
            onClick={() => navigate('/auth/tel-change')}
            className="py-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            전화번호가 바뀌어 로그인할 수 없나요? ›
          </button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            데모 화면입니다 · 실제 로그인 없이 진행됩니다
          </p>
          <button
            type="button"
            data-testid="qa-gallery-entry"
            onClick={() => navigate('/cards')}
            className="mt-1 w-full rounded-xl border border-dashed py-2.5 text-center text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
          >
            QA · 예약 카드 상태 모음 보기 ›
          </button>
        </div>
      </div>
    </PhoneFrame>
  )
}
