import { getSlots } from '@/mock/data'
import type { Slot } from '@/mock/types'
import type { StepProps } from '../BookingWizard'

// 5단계 — 시간(BOOK-TIME-*). 오전/오후 두 덩어리 + 3열 격자, 가능 시간만.
export function Step5Time({ wizard }: { wizard: StepProps }) {
  const { state, setField, next } = wizard
  const slots = state.doctor && state.date ? getSlots(state.doctor.id, state.date) : []
  const morning = slots.filter((s) => s.period === '오전')
  const afternoon = slots.filter((s) => s.period === '오후')

  const choose = (t: string) => {
    setField('time', t)
    next()
  }

  const Group = ({ label, list }: { label: string; list: Slot[] }) => {
    if (list.length === 0) return null // 한쪽이 0이면 통째로 감춘다(BOOK-TIME-06)
    return (
      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold">
          {label} <span className="text-muted-foreground">· {list.length}자리</span>
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {list.map((s) => (
            <button
              key={s.time}
              onClick={() => choose(s.time)}
              className="rounded-xl border py-3 text-sm font-semibold tabular-nums hover:border-primary hover:bg-primary hover:text-primary-foreground"
            >
              {s.time}
            </button>
          ))}
        </div>
      </section>
    )
  }

  return (
    <div>
      <h1 className="mb-5 text-xl font-bold">몇 시에 오시겠어요?</h1>
      <Group label="오전" list={morning} />
      <Group label="오후" list={afternoon} />
    </div>
  )
}
