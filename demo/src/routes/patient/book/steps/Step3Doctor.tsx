import { doctorsByDept } from '@/mock/data'
import { DoctorAvatar } from '@/components/DoctorAvatar'
import type { StepProps } from '../BookingWizard'

// 3단계 — 의사(BOOK-DOC-*). 가로 줄: 의사 사진(일러스트) + 이름→진료시간→분야.
// 상단에 선택된 대상을 차분한 보조 라벨로만 표시(BOOK-DOC-08).
export function Step3Doctor({ wizard }: { wizard: StepProps }) {
  const { state, setField, next } = wizard
  const doctors = state.dept ? doctorsByDept[state.dept.id] ?? [] : []

  return (
    <div>
      <h1 className="text-xl font-bold">어느 선생님께 예약할까요?</h1>
      {state.who && (
        <p className="mb-5 mt-1 text-xs text-muted-foreground">
          {state.dept?.name} · {state.who.name} 님
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {doctors.map((doc) => (
          <button
            key={doc.id}
            onClick={() => {
              setField('doctor', doc)
              next()
            }}
            className="flex items-center gap-3 rounded-2xl bg-card p-3 text-left shadow-(--elevation-card) transition-colors hover:bg-primary/5"
          >
            <DoctorAvatar seed={doc.name} name={doc.name} className="h-14 w-14" />
            <span className="flex flex-col">
              <span className="text-base font-bold">{doc.name}</span>
              <span className="text-sm font-semibold text-primary">{doc.scheduleSummary}</span>
              <span className="text-sm text-muted-foreground">{doc.specialty}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
