import { useCallback, useEffect, useRef, useState } from 'react'

export const IDLE_TIMEOUT_MS = 30 * 60_000
export const IDLE_WARNING_MS = 27 * 60_000

export function useIdleLogout({ signOut }: { signOut: () => void | Promise<void> }) {
  const lastAction = useRef(Date.now())
  const signedOut = useRef(false)
  const [msIdle, setMsIdle] = useState(0)

  const keepAlive = useCallback(() => {
    lastAction.current = Date.now()
    signedOut.current = false
    setMsIdle(0)
  }, [])

  useEffect(() => {
    const events: (keyof DocumentEventMap)[] = ['keydown', 'mousedown', 'focusin']
    events.forEach((event) => document.addEventListener(event, keepAlive))
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - lastAction.current
      setMsIdle(elapsed)
      if (elapsed >= IDLE_TIMEOUT_MS && !signedOut.current) {
        signedOut.current = true
        void signOut()
      }
    }, 1_000)
    return () => {
      window.clearInterval(timer)
      events.forEach((event) => document.removeEventListener(event, keepAlive))
    }
  }, [keepAlive, signOut])

  return { msIdle, isWarning: msIdle >= IDLE_WARNING_MS, keepAlive }
}
