import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

/**
 * ⭐ 연결 판정을 하는 단 하나의 지점. 화면·컴포넌트는 자기 나름대로 연결을 판정하지 않고
 *    여기의 `online`만 본다 — 판정 규칙이 갈라지면 같은 순간에 어떤 화면은 온라인, 어떤 화면은
 *    오프라인으로 보이는 사고가 난다.
 *
 * `online`          : 지금 인터넷에 닿을 수 있다고 보는가(브라우저의 online/offline 신호).
 * `lastServerOkAt`  : 마지막으로 **서버 응답을 성공**으로 받은 절대 시각. 서버 응답이 한 번도
 *                     없었으면 `null`이다 — 낡은 시각을 지어내지 않는다(`OFFX-STAFF-01`).
 * `markServerOk`    : 서버 호출이 성공했을 때만 부른다. ⭐ 온라인으로 「돌아온 것」만으로는
 *                     부르지 않는다 — 재조회가 성공해야 새것이다(`OFFX-STAFF-04`).
 */
export interface ConnectivityValue {
  online: boolean
  lastServerOkAt: Date | null
  markServerOk(at?: Date): void
}

const ConnectivityContext = createContext<ConnectivityValue | null>(null)

function browserOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(browserOnline)
  // 서버 응답 성공으로만 채워진다. 오프라인 전환·온라인 복귀는 이 값을 건드리지 않는다.
  const [lastServerOkAt, setLastServerOkAt] = useState<Date | null>(null)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  const markServerOk = useCallback((at: Date = new Date()) => {
    setLastServerOkAt(at)
  }, [])

  return (
    <ConnectivityContext.Provider value={{ online, lastServerOkAt, markServerOk }}>
      {children}
    </ConnectivityContext.Provider>
  )
}

export function useConnectivity(): ConnectivityValue {
  const value = useContext(ConnectivityContext)
  if (!value) throw new Error('useConnectivity must be used inside ConnectivityProvider')
  return value
}
