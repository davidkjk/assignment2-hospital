import type { ReactNode } from 'react'
import { BottomTabBar } from './BottomTabBar'
import { StatusBar } from './StatusBar'

/**
 * 환자 앱은 휴대폰 앱이므로 데모는 390×844 폰 틀 안에 렌더한다(설계 §4).
 * 맨 위 상태바(시간·신호·배터리)로 진짜 폰처럼 보이게 한다.
 * 하단 탭바는 전역 셸이라 로그인 후 모든 화면에 늘 보인다(정본 NAV-APPT-24·BOOK-KEEP-01).
 * 어느 탭에 해당하는지, 로그인 전·QR 몰입에서 숨길지는 BottomTabBar가 현재 경로로 스스로 판정한다.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-neutral-200 p-6">
      <div
        data-testid="phone-frame"
        className="relative flex h-[844px] w-[390px] flex-col overflow-hidden rounded-[2.5rem] border-8 border-neutral-900 bg-background shadow-2xl"
      >
        <StatusBar />
        <div className="min-h-0 w-full flex-1 overflow-y-auto">{children}</div>
        <BottomTabBar />
      </div>
    </div>
  )
}
