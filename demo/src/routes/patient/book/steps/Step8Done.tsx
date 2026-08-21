import { useNavigate } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { StepProps } from '../BookingWizard'

// 8단계 — 완료 결과 화면. [홈으로]만(BOOK-NAV-08: 마법사로 되돌아가지 않는다).
export function Step8Done({ wizard }: { wizard: StepProps }) {
  const navigate = useNavigate()
  const { state } = wizard

  return (
    <div
      data-testid="book-done"
      className="flex h-full flex-col items-center justify-center gap-4 text-center"
    >
      <CheckCircle2 className="h-16 w-16 text-primary" />
      <h1 className="text-xl font-bold">예약이 확정되었습니다</h1>
      <p className="text-sm text-muted-foreground">
        {state.date} {state.time}
        <br />
        {state.dept?.name} · {state.doctor?.name} 선생님
      </p>
      {/* BOOK-DONE-04: 큰 버튼 [사전문진 작성하기] + 작은 글씨 [나중에 할게요] */}
      <div className="mt-4 flex w-full flex-col items-center gap-2 px-8">
        <Button className="w-full" onClick={() => navigate('/questionnaire')}>
          사전문진 작성하기
        </Button>
        <button
          type="button"
          onClick={() => navigate('/home')}
          className="py-1 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          나중에 할게요
        </button>
      </div>
    </div>
  )
}
