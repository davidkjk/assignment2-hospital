import { Button } from '@/components/ui/button'
import type { StepProps } from '../BookingWizard'

// 6단계 — 방문 이유(BOOK-WHY-*). 자유 입력 100자, 필수 아님(건너뛰기), 안내 상자.
export function Step6Why({ wizard }: { wizard: StepProps }) {
  const { state, setField, next } = wizard
  const value = state.reason ?? ''

  return (
    <div className="flex h-full flex-col">
      <h1 className="mb-1 text-xl font-bold">어떤 일로 오시나요?</h1>
      <p className="mb-4 text-sm text-muted-foreground">간단히 적어주시면 진료 준비에 도움이 됩니다.</p>

      <textarea
        value={value}
        maxLength={100}
        onChange={(e) => setField('reason', e.target.value)}
        placeholder="예: 3일 전부터 기침과 콧물이 있어요"
        className="min-h-28 w-full rounded-xl border p-3 text-sm outline-none focus:border-primary"
      />
      <div className="mt-1 text-right text-xs text-muted-foreground">{value.length}/100</div>

      <div className="mt-3 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
        여기 적으신 내용은 나중에 작성하실 사전문진의 첫 문항에 그대로 옮겨져 있습니다. 거기서 더
        자세히 고쳐 쓰실 수 있습니다.
      </div>

      <div className="mt-auto flex gap-2 pt-6">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => {
            setField('reason', undefined)
            next()
          }}
        >
          건너뛰기
        </Button>
        <Button className="flex-1" onClick={() => next()}>
          다음
        </Button>
      </div>
    </div>
  )
}
