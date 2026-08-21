import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'

/**
 * 화면 상단의 채운 딥틸 헤더 밴드(정본 목업 `.ap-bar`·`.ph-bar` = teal 배경·흰 글자).
 * 흰 헤더+가는 선은 화면을 와이어프레임처럼 보이게 해, 2차 화면은 이 밴드로 통일한다.
 * (홈은 브랜드 앱바가 따로 있어 이 컴포넌트를 쓰지 않는다.)
 */
export function ScreenHeader({
  title,
  onBack,
  icon,
  right,
  testId,
}: {
  title: string
  onBack?: () => void
  icon?: ReactNode
  right?: ReactNode
  testId?: string
}) {
  return (
    <header
      data-testid={testId}
      className="flex h-12 items-center gap-2 bg-primary px-4 text-primary-foreground shadow-[0_2px_10px_rgba(0,0,0,0.08)]"
    >
      {onBack ? (
        <button
          type="button"
          aria-label="뒤로"
          onClick={onBack}
          className="-ml-1 rounded-full p-1 hover:bg-white/15"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      ) : null}
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <h1 className="text-base font-medium tracking-normal">{title}</h1>
      {right ? <div className="ml-auto flex items-center gap-1">{right}</div> : null}
    </header>
  )
}
