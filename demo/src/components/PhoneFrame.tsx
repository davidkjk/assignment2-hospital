import type { ReactNode } from 'react'

/** 환자 앱은 휴대폰 앱이므로 데모는 390×844 폰 틀 안에 렌더한다(설계 §4). */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-neutral-200 p-6">
      <div
        data-testid="phone-frame"
        className="relative h-[844px] w-[390px] overflow-hidden rounded-[2.5rem] border-8 border-neutral-900 bg-background shadow-2xl"
      >
        <div className="h-full w-full overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
