// 환자 상세 공통 표시 도우미 — 시각은 서버 문자열의 앞자리를 그대로 읽는다(로컬 타임존에
// 흔들리지 않게). occurred_at은 KST로 계산돼 오므로 Date로 다시 해석하지 않는다.

/** "2026-08-17T14:30" → "8/17 14:30" (월/일 시:분). */
export function mdHm(iso: string): string {
  const m = /(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso)
  if (!m) return iso
  return `${Number(m[2])}/${Number(m[3])} ${m[4]}:${m[5]}`
}

/** "2026-08-05" → "8/5" (월/일). */
export function md(iso: string): string {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${Number(m[2])}/${Number(m[3])}`
}

/** 어느 섹션이든 같은 3-상태(로딩·오류·데이터)를 같은 모양으로 받는다(PTDET-LOAD-02). */
export interface SectionState<T> {
  loading: boolean
  error: boolean
  data: T | undefined
  retry: () => void
}
