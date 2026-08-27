import { useCallback, useEffect, useRef, useState } from 'react'
import type { DraftFields } from './useDraftStore'

// [DOCTOR-RECORD-04·05] 서버 자동 임시저장 — ⭐ 간격 확정(2026-08-15): 타이핑이 멈춘 지 **3초**에
//   저장하되, **직전 저장으로부터 30초**가 안 지났으면 그때까지 미룬다.
//   ⛔ 고정 주기(60초) 금지(손을 쓰는 도중 「저장 중…」이 뜬다). ⛔ blur에만 저장 금지(가장 긴 글을
//      쓰는 칸이 가장 오래 안 저장된다). 이 자동저장은 브라우저·기기 사고 대비다(세션은 무활동 기준).
//   실패해도 입력을 지우지 않고 오류·[다시 시도]를 준다. 「임시저장」이라고만 말한다(RECORD-05).

const DEBOUNCE_MS = 3_000
const MIN_INTERVAL_MS = 30_000

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/** 저장 표시는 「임시저장」이라고만 말한다 — 완료(진료 완료·저장 완료)로 오해하게 두지 않는다. */
export function draftStatusText(status: AutoSaveStatus, savedAt: Date | null): string {
  if (status === 'saving') return '임시저장 중…'
  if (status === 'saved' && savedAt) return `임시저장됨 · ${hhmm(savedAt)}`
  return ''
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface UseAutoSaveDraftArgs {
  fields: DraftFields
  onSave: (fields: DraftFields) => Promise<void>
  /** 과거 날짜 읽기전용·미선택 등에서는 자동저장을 끈다. */
  enabled?: boolean
}

export function useAutoSaveDraft({ fields, onSave, enabled = true }: UseAutoSaveDraftArgs) {
  const [status, setStatus] = useState<AutoSaveStatus>('idle')
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 직전 저장을 시작한 절대 시각(30초 바닥의 기준). 아직 저장한 적 없으면 바닥이 없다.
  const lastSaveRef = useRef<number>(Number.NEGATIVE_INFINITY)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const fieldsRef = useRef(fields)
  const onSaveRef = useRef(onSave)
  const firstRunRef = useRef(true)
  fieldsRef.current = fields
  onSaveRef.current = onSave

  const runSave = useCallback(async () => {
    lastSaveRef.current = Date.now()
    setStatus('saving')
    try {
      await onSaveRef.current(fieldsRef.current)
      setStatus('saved')
      setSavedAt(new Date())
      setError(null)
    } catch (e) {
      // 성공한 척하지 않는다 — 입력은 폼이 그대로 쥐고 있고, 여기선 오류만 알린다(RECORD-05).
      setStatus('error')
      setError(e instanceof Error ? e.message : '임시저장에 실패했습니다.')
    }
  }, [])

  const serialized = JSON.stringify(fields)
  useEffect(() => {
    if (!enabled) return
    // 마운트(되살린 값 포함) 자체로는 저장하지 않는다 — 첫 「변경」부터 센다.
    if (firstRunRef.current) {
      firstRunRef.current = false
      return
    }
    clearTimeout(timerRef.current)
    const delay = Math.max(DEBOUNCE_MS, lastSaveRef.current + MIN_INTERVAL_MS - Date.now())
    timerRef.current = setTimeout(() => void runSave(), delay)
    return () => clearTimeout(timerRef.current)
  }, [serialized, enabled, runSave])

  const retry = useCallback(() => runSave(), [runSave])

  return { status, savedAt, error, retry }
}
