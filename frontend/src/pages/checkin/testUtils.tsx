import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ConnectivityProvider } from '../../lib/connectivity'
import { OfflineBanner } from '../../components/OfflineBanner'
import { CheckInPage } from './CheckInPage'
import type { QrScanController, QrScannerFactory } from './QrScanner'
import type { BookingLookupResult } from '../../api/appointments'

// jsdom엔 scrollIntoView가 없다 — InlineError(ERR-POS-02)가 마운트 시 부르므로 no-op으로 채운다.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// jsdom은 카메라·디코더를 만들 수 없다 — QrScanner의 factory 경계에 가짜 컨트롤러를 주입한다.
// decode()/failNext()로 실제 카메라 없이 SCAN-* 규칙을 검증한다(brief·plan Step 10).
export interface FakeCamera {
  started: boolean
  factory: QrScannerFactory
  decode(text: string): void
  failNext(): void
}

export function makeFakeCamera(): FakeCamera {
  let decodeCb: ((text: string) => void) | null = null
  let willFail = false
  const cam: FakeCamera = {
    started: false,
    failNext() { willFail = true },
    decode(text) { decodeCb?.(text) },
    factory(): QrScanController {
      return {
        async start(onDecode) {
          if (willFail) { willFail = false; throw new Error('camera-unavailable') }
          cam.started = true
          decodeCb = onDecode
        },
        async stop() { cam.started = false; decodeCb = null },
      }
    },
  }
  return cam
}

/** 오늘(KST) 그 시각 — 서버가 주는 모양대로 **오프셋을 붙여** 만든다.
 *  ⚠️ 오프셋 없는 문자열은 러너 TZ에서 해석돼, 화면이 KST로 그리는 값과 어긋난다. */
export function todayAt(hhmm: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const got = Object.fromEntries(parts.map((p) => [p.type, p.value]))
  return `${got.year}-${got.month}-${got.day}T${hhmm}:00+09:00`
}

export function foundCard(over: Partial<BookingLookupResult> = {}): BookingLookupResult {
  return {
    appointment_id: 'a1',
    patient_name: '김민정',
    slot_at: todayAt('10:30'),
    department_name: '내과',
    doctor_name: '김의사',
    status: '예약확정',
    updated_at: '2026-08-27T01:00:00+00:00',
    ...over,
  }
}

export function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname + loc.search}</div>
}

export function renderCheckIn(opts: { scannerFactory?: QrScannerFactory; initial?: string } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ConnectivityProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[opts.initial ?? '/checkin']}>
          <OfflineBanner />
          <Routes>
            <Route path="/checkin" element={<CheckInPage scannerFactory={opts.scannerFactory} />} />
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </ConnectivityProvider>
    </QueryClientProvider>,
  )
}
