import { ChevronRight, HelpCircle } from 'lucide-react'
import { departments } from '@/mock/data'
import type { StepProps } from '../BookingWizard'

// 2단계 — 진료과(BOOK-DEPT-*). 이름만 + 우측 화살표. 맨 아래 상담 진입점.
export function Step2Dept({ wizard }: { wizard: StepProps }) {
  const { setField, next } = wizard
  return (
    <div>
      <h1 className="mb-5 text-xl font-bold">어느 진료과를 찾으세요?</h1>
      <div className="flex flex-col gap-2">
        {departments.map((d) => (
          <button
            key={d.id}
            onClick={() => {
              setField('dept', d)
              next()
            }}
            className="flex items-center justify-between rounded-2xl border bg-card p-4 text-left hover:border-primary"
          >
            <span className="text-lg font-bold">{d.name}</span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        ))}

        {/* 상담 진입점(BOOK-DEPT-02). 데모라 안내만. */}
        <button
          disabled
          className="mt-1 flex flex-col items-center gap-1 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4 text-primary/80"
        >
          <span className="flex items-center gap-2 font-semibold">
            <HelpCircle className="h-4 w-4" /> 어느 과인지 모르겠어요
          </span>
          <span className="text-xs text-muted-foreground">
            증상을 말씀하시면 AI 상담봇이 안내해드립니다 (데모에서는 생략)
          </span>
        </button>
      </div>
    </div>
  )
}
