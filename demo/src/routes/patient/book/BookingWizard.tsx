import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { PhoneFrame } from '@/components/PhoneFrame'
import { Progress } from '@/components/ui/progress'
import { useBookingState, TOTAL_STEPS } from './useBookingState'
import { Step1Who } from './steps/Step1Who'
import { Step2Dept } from './steps/Step2Dept'
import { Step3Doctor } from './steps/Step3Doctor'

export type StepProps = ReturnType<typeof useBookingState>

// 정본 묶음 3(BOOK-NAV-*). 한 화면 한 질문, 진행 막대 + 'N단계/8단계·이름',
// 뒤로 한 단계씩(1단계에서 뒤로는 마법사 나가기 BOOK-KEEP-05).
export function BookingWizard() {
  const navigate = useNavigate()
  const wizard = useBookingState()
  const { state, back } = wizard

  const onBack = () => {
    if (state.step === 1) navigate('/home')
    else back()
  }

  return (
    <PhoneFrame>
      <div data-testid="book-screen" className="flex h-full flex-col">
        {/* 진행 헤더 */}
        <header className="border-b px-5 py-4">
          <div className="mb-3 flex items-center gap-2">
            <button aria-label="뒤로" onClick={onBack} className="-ml-2 rounded-full p-1 hover:bg-muted">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <span className="text-sm font-semibold text-muted-foreground">
              {state.step}단계 / {TOTAL_STEPS}단계 · {wizard.stepName}
            </span>
          </div>
          <Progress value={(state.step / TOTAL_STEPS) * 100} />
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-5">
          <StepBody wizard={wizard} />
        </main>
      </div>
    </PhoneFrame>
  )
}

function StepBody({ wizard }: { wizard: StepProps }) {
  switch (wizard.state.step) {
    case 1:
      return <Step1Who wizard={wizard} />
    case 2:
      return <Step2Dept wizard={wizard} />
    case 3:
      return <Step3Doctor wizard={wizard} />
    default:
      return (
        <p className="mt-10 text-center text-muted-foreground">
          {wizard.stepName} 단계 — 다음 태스크에서 채웁니다
        </p>
      )
  }
}
