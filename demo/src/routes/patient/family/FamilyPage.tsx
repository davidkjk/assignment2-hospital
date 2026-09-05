import type { ReactNode } from 'react'
import { PhoneFrame } from '@/components/PhoneFrame'
import { ScreenHeader } from '@/components/ScreenHeader'

type FamilyPageProps = {
  testId: string
  title: string
  children: ReactNode
  onBack?: () => void
  icon?: ReactNode
}

export function FamilyPage({ testId, title, children, onBack, icon }: FamilyPageProps) {
  return (
    <PhoneFrame>
      <div data-testid={testId} className="flex h-full flex-col">
        <ScreenHeader title={title} onBack={onBack} icon={icon} />
        <main className="flex-1 overflow-y-auto px-5 py-5">{children}</main>
      </div>
    </PhoneFrame>
  )
}

type FamilyDialogProps = {
  testId: string
  title: string
  children: ReactNode
  onClose: () => void
}

export function FamilyDialog({ testId, title, children, onClose }: FamilyDialogProps) {
  return (
    <div
      data-testid={testId}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${testId}-title`}
      className="fixed inset-0 z-10 flex items-center justify-center bg-background/80 p-6"
    >
      <div className="w-full max-w-sm rounded-2xl border bg-card p-5 shadow-xl">
        <h2 id={`${testId}-title`} className="text-base font-bold">
          {title}
        </h2>
        <div className="mt-3 text-sm">{children}</div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:border-primary hover:bg-primary/5"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
