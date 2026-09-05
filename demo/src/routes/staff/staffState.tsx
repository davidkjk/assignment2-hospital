import { createContext, useContext, useState, type ReactNode } from 'react'
import { DEFAULT_STAFF, type CurrentStaff } from './mockData'

// 데모용 현재 로그인 직원 상태. 실제 앱은 Supabase Auth 세션 + 서버가 읽은 staff.role.
// 여기서는 로그인 화면이 고른 계정을 담아 두고, 셸/사이드바가 역할로 메뉴를 거른다(SHELL-NAV-02~04).
interface StaffCtx {
  staff: CurrentStaff
  login: (s: CurrentStaff) => void
  logout: () => void
}

const Ctx = createContext<StaffCtx | null>(null)

export function StaffProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<CurrentStaff>(DEFAULT_STAFF)
  return (
    <Ctx.Provider value={{ staff, login: setStaff, logout: () => setStaff(DEFAULT_STAFF) }}>
      {children}
    </Ctx.Provider>
  )
}

export function useStaff(): StaffCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStaff must be used within StaffProvider')
  return v
}
