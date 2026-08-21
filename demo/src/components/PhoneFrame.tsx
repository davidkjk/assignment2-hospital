import type { ReactNode } from 'react'
import { BottomTabBar } from './BottomTabBar'
import type { TabKey } from './BottomTabBar'

/**
 * 환자 앱은 휴대폰 앱이므로 데모는 390×844 폰 틀 안에 렌더한다(설계 §4).
 * activeTab을 주면 전역 셸의 하단 탭바를 함께 그린다(홈·예약·가족·이력·AI 상담).
 * 상세·마법사·설정 하위 등 탭이 아닌 화면은 activeTab 없이 뒤로가기로만 이동한다.
 */
export function PhoneFrame({ children, activeTab }: { children: ReactNode; activeTab?: TabKey }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-neutral-200 p-6">
      <div
        data-testid="phone-frame"
        className="relative flex h-[844px] w-[390px] flex-col overflow-hidden rounded-[2.5rem] border-8 border-neutral-900 bg-background shadow-2xl"
      >
        <div className="min-h-0 w-full flex-1 overflow-y-auto">{children}</div>
        {activeTab && <BottomTabBar active={activeTab} />}
      </div>
    </div>
  )
}
