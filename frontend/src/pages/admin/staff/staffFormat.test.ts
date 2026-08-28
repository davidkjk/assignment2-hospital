import { expect, test } from 'vitest'
import { formatLastSignIn } from './staffFormat'

// [TIME-TZ-01] 「오늘·어제」는 병원 자정을 기준으로 가른다 — 그 PC 자정이 아니다.
test('한국 새벽에 접속한 기록을 「어제」로 적지 않는다', () => {
  const now = new Date('2026-08-28T16:20:00Z')       // 병원 8/29 01:20
  const signedIn = new Date('2026-08-28T15:30:00Z')  // 병원 8/29 00:30 — 같은 날이다
  expect(formatLastSignIn(signedIn.toISOString(), now)).toBe('오늘 00:30')
})
