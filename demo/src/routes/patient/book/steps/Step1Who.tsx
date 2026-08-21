import { ChevronRight, UserPlus } from 'lucide-react'
import { patients } from '@/mock/data'
import type { StepProps } from '../BookingWizard'

// 1단계 — 누구의 예약인가(BOOK-WHO-*). 본인 + 가족 목록, 본인 맨 위.
export function Step1Who({ wizard }: { wizard: StepProps }) {
  const { setField, next } = wizard

  const choose = (p: (typeof patients)[number]) => {
    setField('who', p)
    next()
  }

  return (
    <div>
      <h1 className="mb-5 text-xl font-bold">누구의 예약인가요?</h1>
      <div className="flex flex-col gap-2">
        {patients.map((p) => (
          <button
            key={p.id}
            onClick={() => choose(p)}
            className="flex items-center justify-between rounded-2xl border bg-card p-4 text-left hover:border-primary"
          >
            <span className="text-base font-semibold">
              {p.name}
              <span className="ml-2 text-sm font-normal text-muted-foreground">{p.relation}</span>
            </span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        ))}

        {/* 가족 추가 — 항상 노출(BOOK-WHO-07). 데모라 안내만. */}
        <button
          disabled
          className="mt-1 flex items-center justify-center gap-2 rounded-2xl border border-dashed p-4 text-muted-foreground"
        >
          <UserPlus className="h-4 w-4" /> 가족 추가하기 (데모에서는 생략)
        </button>
      </div>
    </div>
  )
}
