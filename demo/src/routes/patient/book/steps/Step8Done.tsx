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
      <CheckCircle2 className="h-16 w-16 text-emerald-500" />
      <h1 className="text-xl font-bold">예약이 확정되었습니다</h1>
      <p className="text-sm text-muted-foreground">
        {state.date} {state.time}
        <br />
        {state.dept?.name} · {state.doctor?.name} 선생님
      </p>
      <Button className="mt-4 w-40" onClick={() => navigate('/home')}>
        홈으로
      </Button>
    </div>
  )
}
