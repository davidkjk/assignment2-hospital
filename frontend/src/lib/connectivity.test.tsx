import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { ConnectivityProvider, useConnectivity } from './connectivity'
import { OfflineBanner } from '../components/OfflineBanner'

const OK_AT = '2026-08-26T05:14:00.000Z'

function Probe() {
  const { online, lastServerOkAt, markServerOk } = useConnectivity()
  return (
    <div>
      <span data-testid="online">{String(online)}</span>
      <span data-testid="okat">{lastServerOkAt ? lastServerOkAt.toISOString() : 'none'}</span>
      <button onClick={() => markServerOk(new Date(OK_AT))}>서버확인표시</button>
    </div>
  )
}

const setup = () => render(<ConnectivityProvider><Probe /></ConnectivityProvider>)

function setBrowserOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})

test('[OFFX-STAFF-01] 처음엔 브라우저 연결 상태를 그대로 따른다', () => {
  setup()
  expect(screen.getByTestId('online').textContent).toBe('true')
})

test('[OFFX-STAFF-01] 끊기면 online이 false가 된다', () => {
  setup()
  act(() => setBrowserOnline(false))
  expect(screen.getByTestId('online').textContent).toBe('false')
})

test('[OFFX-STAFF-01] 서버 응답이 한 번도 없으면 시각을 지어내지 않는다', () => {
  // 낡은 시각을 만들어 붙이면 그 숫자가 거짓말이 된다 — 없으면 없는 대로 둔다.
  setup()
  expect(screen.getByTestId('okat').textContent).toBe('none')
})

test('[OFFX-STAFF-01] 서버에서 확인한 절대 시각은 서버 응답 성공으로만 생긴다', async () => {
  setup()
  await userEvent.click(screen.getByText('서버확인표시'))
  expect(screen.getByTestId('okat').textContent).toBe(OK_AT)
})

test('[OFFX-STAFF-04] 온라인 복귀만으로는 서버 확인 시각을 만들지 않는다', () => {
  // 연결이 붙었다고 데이터가 새것이 되는 게 아니다 — 재조회가 성공해야 새것이다.
  setup()
  act(() => setBrowserOnline(false))
  act(() => setBrowserOnline(true))
  expect(screen.getByTestId('okat').textContent).toBe('none')
})

test('[OFFX-STAFF-04] 오프라인이 됐다고 이미 확인한 시각을 지우지 않는다', async () => {
  setup()
  await userEvent.click(screen.getByText('서버확인표시'))
  act(() => setBrowserOnline(false))
  expect(screen.getByTestId('okat').textContent).toBe(OK_AT)
})

// ── OfflineBanner: 연결이 끊기면 맨 위 띠 + 마지막 서버 확인 시각 ──────────

// 서버 확인 시각을 로컬 오후 2:14로 못박아 브라우저 시간대와 무관하게 검증한다.
const LOCAL_OK_AT = '2026-08-26T14:14:00'

function BannerHarness() {
  const { markServerOk } = useConnectivity()
  return (
    <>
      <button onClick={() => markServerOk(new Date(LOCAL_OK_AT))}>서버확인표시</button>
      <OfflineBanner />
    </>
  )
}
const setupBanner = () => render(<ConnectivityProvider><BannerHarness /></ConnectivityProvider>)

test('[OFFX-STAFF-01] 연결이 살아 있으면 띠를 보이지 않는다', () => {
  setupBanner()
  expect(screen.queryByText('인터넷이 연결되어 있지 않습니다')).toBeNull()
})

test('[OFFX-STAFF-01] 끊기면 맨 위에 연결 안내 띠를 보인다', () => {
  setupBanner()
  act(() => setBrowserOnline(false))
  expect(screen.getByText('인터넷이 연결되어 있지 않습니다')).toBeVisible()
})

test('[OFFX-STAFF-01] 마지막으로 서버에서 확인한 절대 시각을 함께 보인다', async () => {
  // 「방금」·「몇 분 전」이 아니라 절대 시각이다.
  setupBanner()
  await userEvent.click(screen.getByText('서버확인표시'))
  act(() => setBrowserOnline(false))
  expect(screen.getByText(/오후 2:14 기준/)).toBeVisible()
})

test('[OFFX-STAFF-01] 서버 응답이 한 번도 없으면 시각을 지어내지 않는다', () => {
  // 낡은 시각을 만들어 붙이면 그 숫자가 거짓말이 된다 — 「기준」 표시를 아예 걸지 않는다.
  setupBanner()
  act(() => setBrowserOnline(false))
  expect(screen.queryByText(/기준/)).toBeNull()
})

test('[OFFX-STAFF-05] 직원 데이터를 영속 캐시(localStorage·indexedDB)에 쓰지 않는다', () => {
  // 공용 PC다 — 로그아웃한 뒤에도 환자 목록이 디스크에 남으면 안 된다.
  // 연결 판정 지점은 메모리 상태(useState)로만 산다: 영속 저장소를 아예 건드리지 않는다.
  const source = readFileSync(resolve(process.cwd(), 'src/lib/connectivity.tsx'), 'utf8')
  expect(source).not.toMatch(/localStorage|indexedDB|sessionStorage/)
})
