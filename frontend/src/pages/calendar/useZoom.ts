import { useCallback, useState } from 'react'

// [CAL-ZOOM-*] 시간축 확대·축소 — 5분 단위가 되면서 필요해졌다(5분=10px이라 글자가 안 들어간다).
//   ⭐ 확대는 정밀도가 아니라 가독성이다(CAL-ZOOM-08) — 스냅은 5분 그대로다(snap.ts).
//   ⭐ 주간도 같은 배율을 쓴다(CAL-ZOOM-07) — 일간·주간이 같은 부품이므로 훅도 하나다.

export const MIN_HOUR_HEIGHT = 30 // 최소: 하루가 한 화면에 들어온다(CAL-ZOOM-03)
export const MAX_HOUR_HEIGHT = 240 // 최대: 5분이 20px이라 글자가 들어간다(CAL-ZOOM-03)
export const DEFAULT_HOUR_HEIGHT = 120 // 기본: 15분=30px

function storageKey(staffKey: string): string {
  return `calendar.hourHeight.${staffKey}`
}

// localStorage가 없거나(테스트 jsdom) 메서드가 없는 환경에서도 세션 안에서는 기억한다.
const memory = new Map<string, string>()

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function'
}

function readRaw(key: string): string | null {
  if (hasLocalStorage()) return localStorage.getItem(key)
  return memory.has(key) ? (memory.get(key) as string) : null
}

function writeRaw(key: string, value: string): void {
  if (hasLocalStorage()) localStorage.setItem(key, value)
  else memory.set(key, value)
}

function clamp(px: number): number {
  return Math.max(MIN_HOUR_HEIGHT, Math.min(MAX_HOUR_HEIGHT, px))
}

function readStored(staffKey: string): number {
  const raw = readRaw(storageKey(staffKey))
  if (raw == null) return DEFAULT_HOUR_HEIGHT
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? clamp(parsed) : DEFAULT_HOUR_HEIGHT
}

export interface Zoom {
  hourHeight: number
  /** 시간축을 위아래로 끈 픽셀만큼 1시간 높이를 바꾼다(창 크기 늘리듯). */
  dragBy(deltaPx: number): void
  /** [기본 배율] — 너무 크게/작게 만들어 길을 잃는 것을 막는다(CAL-ZOOM-06). */
  reset(): void
}

/**
 * 배율은 그 직원에게 기억된다(CAL-ZOOM-05) — 매번 되돌아가면 「끌 수 없는 스위치」의 짜증이 된다.
 * `staffKey`는 로그인한 직원의 식별자(사람마다 눈이 다르다).
 */
export function useZoom(staffKey: string): Zoom {
  const [hourHeight, setHourHeight] = useState(() => readStored(staffKey))

  const persist = useCallback(
    (next: number) => writeRaw(storageKey(staffKey), String(next)),
    [staffKey],
  )

  const dragBy = useCallback(
    (deltaPx: number) => {
      setHourHeight((prev) => {
        const next = clamp(prev + deltaPx)
        persist(next)
        return next
      })
    },
    [persist],
  )

  const reset = useCallback(() => {
    setHourHeight(DEFAULT_HOUR_HEIGHT)
    persist(DEFAULT_HOUR_HEIGHT)
  }, [persist])

  return { hourHeight, dragBy, reset }
}
