import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { PhoneFrame } from '@/components/PhoneFrame'
import { Progress } from '@/components/ui/progress'
import { useBookingState, TOTAL_STEPS } from './useBookingState'
import { Step1Who } from './steps/Step1Who'
import { Step2Dept } from './steps/Step2Dept'
import { Step3Doctor } from './steps/Step3Doctor'
import { Step4Date } from './steps/Step4Date'
import { Step5Time } from './steps/Step5Time'
import { Step6Why } from './steps/Step6Why'
import { Step7Confirm } from './steps/Step7Confirm'
import { Step8Done } from './steps/Step8Done'

export type StepProps = ReturnType<typeof useBookingState>

// 정본 묶음 3(BOOK-NAV-*). 한 화면 한 질문, 진행 막대 + 'N단계/8단계·이름',
// 뒤로 한 단계씩(1단계에서 뒤로는 마법사 나가기 BOOK-KEEP-05).
export function BookingWizard() {
  const navigate = useNavigate()
  const wizard = useBookingState()
  const { state, back } = wizard

  const onBack = () => {
    // 1단계 뒤로는 마법사 나가기(BOOK-KEEP-05), 8단계(완료) 뒤로도 홈(BOOK-NAV-08)
    if (state.step === 1 || state.step === TOTAL_STEPS) navigate('/home')
    else back()
  }

  return (
    <PhoneFrame>
      <div data-testid="book-screen" className="flex h-full flex-col">
        {/* 진행 헤더 */}
        <header className="border-b px-5 py-4">
          <div className="mb-3 flex items-center gap-2">
            <button aria-label="뒤로" onClick={onBack} className="-ml-2 rounded-full p-1 hover:bg-primary/5">
              <ChevronLeft className="h-6 w-6 text-primary" />
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
    case 4:
      return <Step4Date wizard={wizard} />
    case 5:
      return <Step5Time wizard={wizard} />
    case 6:
      return <Step6Why wizard={wizard} />
    case 7:
      return <Step7Confirm wizard={wizard} />
    case 8:
      return <Step8Done wizard={wizard} />
    default:
      return null
  }
}
