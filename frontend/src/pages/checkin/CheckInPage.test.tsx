import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse, delay } from 'msw'
import { beforeEach, describe, expect, test } from 'vitest'
import { server } from '../../test/msw/server'
import { renderCheckIn, makeFakeCamera, foundCard } from './testUtils'
import type { BookingLookupResult } from '../../api/appointments'

// 백엔드 계약: GET /appointments/find-by-code?code= → { appointment: BookingLookupResult | null }
//            PATCH /appointments/{id}/status(1단계 기존 — 도착 처리, expected_updated_at 낙관 잠금)

let lookupCount = 0
let lastCode = ''
const statusBodies: { id: string | readonly string[] | undefined; body: Record<string, unknown> }[] = []

function onLookup(resolver: () => Response | Promise<Response>) {
  server.use(
    http.get('*/appointments/find-by-code', ({ request }) => {
      lookupCount++
      lastCode = new URL(request.url).searchParams.get('code') ?? ''
      return resolver()
    }),
  )
}

function onStatus(resolver: () => Response | Promise<Response> = () => HttpResponse.json({ status: 'updated' })) {
  server.use(
    http.patch('*/appointments/:id/status', async ({ request, params }) => {
      statusBodies.push({ id: params.id, body: (await request.json()) as Record<string, unknown> })
      return resolver()
    }),
  )
}

function found(appointment: BookingLookupResult | null) {
  return () => HttpResponse.json({ appointment })
}

function field() {
  return screen.getByLabelText('QR이 없나요? 예약번호 직접 입력')
}

beforeEach(() => {
  lookupCount = 0
  lastCode = ''
  statusBodies.length = 0
})

describe('CheckInPage — 예약번호 직접 입력(CHKIN-CODE-*)', () => {
  test('[CHKIN-CODE-01] 빈 칸·안내 문구, 앞사람 이름이 남지 않는다', () => {
    renderCheckIn()
    expect(field()).toHaveValue('')
    expect(screen.getByText('환자가 보여 준 6자리 예약번호를 입력하세요')).toBeVisible()
    expect(screen.queryByTestId('lookup-result')).toBeNull()
  })

  test('[CHKIN-CODE-02] 앞뒤 공백을 지우고 대문자로 바꾼다 — 허용 문자 목록은 늘어놓지 않는다', async () => {
    renderCheckIn()
    await userEvent.type(field(), '  ab34cd  ')
    expect(field()).toHaveValue('AB34CD')
    expect(screen.queryByText(/0.*O.*제외|사용할 수 없는 문자/)).toBeNull()
  })

  test('[CHKIN-CODE-03] Enter가 조회를 한 번 부르고, 화면을 옮기지 않아 주소에 값이 남지 않는다', async () => {
    onLookup(found(null))
    renderCheckIn()
    await userEvent.type(field(), 'AB34CD{Enter}')
    await waitFor(() => expect(lookupCount).toBe(1))
    expect(screen.queryByTestId('location')).toBeNull() // /checkin에 그대로 머문다
  })

  test('[CHKIN-CODE-04] 6자리가 아니면 조회를 부르지 않고 그 칸에서 고치게 한다', async () => {
    onLookup(found(null))
    renderCheckIn()
    await userEvent.type(field(), 'AB3{Enter}')
    expect(lookupCount).toBe(0)
    expect(screen.getByText('예약번호 6자리를 입력해 주세요')).toBeVisible()
    expect(field()).toHaveFocus()
  })

  test('[CHKIN-CODE-05] 조회 중에는 라벨이 바뀌고 버튼이 잠겨 두 번 가지 않는다', async () => {
    onLookup(async () => { await delay(50); return HttpResponse.json({ appointment: null }) })
    renderCheckIn()
    await userEvent.type(field(), 'AB34CD{Enter}')
    const busy = await screen.findByRole('button', { name: '예약번호 확인 중…' })
    expect(busy).toBeDisabled()
    await waitFor(() => expect(lookupCount).toBe(1))
  })

  test('[CHKIN-CODE-07] 예약번호를 모르는 환자의 갈 길을 화면 안에서 말한다(오류 아님)', async () => {
    renderCheckIn()
    expect(screen.getByText('예약번호를 모르는 환자는 대기 목록에서 이름으로 찾을 수 있습니다')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '대기 목록으로' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/queue?tab=not_arrived')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('CheckInPage — QR 스캔(CHKIN-SCAN-*)', () => {
  test('[CHKIN-SCAN-01] 카메라는 버튼을 누른 뒤에만 켜지고 버튼이 [QR 스캔 중지]로 바뀐다', async () => {
    const cam = makeFakeCamera()
    renderCheckIn({ scannerFactory: cam.factory })
    expect(cam.started).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'QR 스캔 시작' }))
    await waitFor(() => expect(cam.started).toBe(true))
    expect(screen.getByRole('button', { name: 'QR 스캔 중지' })).toBeVisible()
  })

  test('[CHKIN-SCAN-02] 디코드 값은 직접 입력과 같은 조회를 한 번 부르고 카메라가 멈춘다', async () => {
    onLookup(found(foundCard()))
    const cam = makeFakeCamera()
    renderCheckIn({ scannerFactory: cam.factory })
    await userEvent.click(screen.getByRole('button', { name: 'QR 스캔 시작' }))
    await waitFor(() => expect(cam.started).toBe(true))
    await act(async () => { cam.decode('  ab34cd\n') })
    await waitFor(() => expect(lookupCount).toBe(1))
    expect(lastCode).toBe('AB34CD')
    await waitFor(() => expect(cam.started).toBe(false))
  })

  test('[CHKIN-SCAN-04] 카메라가 안 켜져도 예약번호 입력은 계속 살아 있다', async () => {
    const cam = makeFakeCamera()
    cam.failNext()
    renderCheckIn({ scannerFactory: cam.factory })
    await userEvent.click(screen.getByRole('button', { name: 'QR 스캔 시작' }))
    expect(await screen.findByText('카메라를 시작할 수 없습니다. 카메라 권한을 확인해주세요')).toBeVisible()
    expect(field()).toBeEnabled()
    expect(screen.getByRole('button', { name: '다시 QR 스캔' })).toBeVisible()
  })

  test('[CHKIN-SCAN-05] [QR 스캔 중지]는 카메라만 끈다 — 입력값·결과는 그대로', async () => {
    onLookup(found(foundCard()))
    const cam = makeFakeCamera()
    renderCheckIn({ scannerFactory: cam.factory })
    await userEvent.type(field(), 'AB34CD{Enter}')
    await screen.findByTestId('lookup-result')
    await userEvent.click(screen.getByRole('button', { name: 'QR 스캔 시작' }))
    await waitFor(() => expect(cam.started).toBe(true))
    await userEvent.click(screen.getByRole('button', { name: 'QR 스캔 중지' }))
    await waitFor(() => expect(cam.started).toBe(false))
    expect(field()).toHaveValue('AB34CD')
    expect(screen.getByTestId('lookup-result')).toBeVisible()
  })
})

describe('CheckInPage — 결과 카드·접수(CHKIN-RESULT-*)', () => {
  test('[CHKIN-RESULT-01] 같은 화면 카드에서 확인한다 — 상세로 떠나지 않는다', async () => {
    onLookup(found(foundCard({ status: '예약확정' })))
    renderCheckIn()
    await userEvent.type(field(), 'AB34CD{Enter}')
    const card = await screen.findByTestId('lookup-result')
    expect(screen.queryByTestId('location')).toBeNull() // 결정 #5 — 화면을 떠나지 않는다
    expect(within(card).getByText('오늘 10:30 · 내과 · 김의사')).toBeVisible()
    expect(within(card).getByRole('button', { name: '진료 대기' })).toBeVisible()
    expect(within(card).getByRole('button', { name: '도착' })).toBeVisible()
  })

  test('[CHKIN-RESULT-02] 만료·취소·없는 번호를 한 문장으로 받고 입력값은 남긴다', async () => {
    onLookup(found(null))
    renderCheckIn()
    await userEvent.type(field(), 'ZZ99ZZ{Enter}')
    expect(await screen.findByText('만료되었거나 존재하지 않는 예약번호입니다')).toBeVisible()
    expect(field()).toHaveValue('ZZ99ZZ')
    expect(screen.queryByText(/취소|부도|없는 환자/)).toBeNull()
  })

  test('[CHKIN-RESULT-03] [도착]은 확인창 없이 기존 상태 전이를 부르고 카드가 도착으로 갱신된다', async () => {
    onLookup(found(foundCard({ status: '예약확정', updated_at: 'T1' })))
    onStatus()
    renderCheckIn()
    await userEvent.type(field(), 'AB34CD{Enter}')
    const card = await screen.findByTestId('lookup-result')
    await userEvent.click(within(card).getByRole('button', { name: '도착' }))
    await waitFor(() => expect(statusBodies).toHaveLength(1))
    expect(statusBodies[0].id).toBe('a1')
    expect(statusBodies[0].body).toEqual({ new_status: '도착', expected_updated_at: 'T1' })
    const updated = screen.getByTestId('lookup-result')
    expect(await within(updated).findByText('도착')).toBeVisible()
    expect(within(updated).getByRole('button', { name: '대기 목록에서 보기' })).toBeVisible()
  })

  test('[CHKIN-RESULT-03] 도착 처리가 409면 카드를 지우지 않고 그 자리에 해결 문구를 준다', async () => {
    onLookup(found(foundCard({ status: '예약확정' })))
    onStatus(() => HttpResponse.json({ detail: '다른 직원이 먼저 처리했습니다.' }, { status: 409 }))
    renderCheckIn()
    await userEvent.type(field(), 'AB34CD{Enter}')
    const card = await screen.findByTestId('lookup-result')
    await userEvent.click(within(card).getByRole('button', { name: '도착' }))
    expect(await within(screen.getByTestId('lookup-result')).findByText('다른 직원이 먼저 처리했습니다.')).toBeVisible()
    expect(within(screen.getByTestId('lookup-result')).getByRole('button', { name: '다시 확인' })).toBeVisible()
  })

  test('[CHKIN-RESULT-04] [진료 대기]는 도착을 거쳐 진료대기까지 이어 붙인다(백엔드 전이표)', async () => {
    let call = 0
    server.use(
      http.get('*/appointments/find-by-code', () => {
        call += 1
        return HttpResponse.json({
          appointment: call === 1
            ? foundCard({ status: '예약확정', updated_at: 'T1' })
            : foundCard({ status: '도착', updated_at: 'T2' }),
        })
      }),
    )
    onStatus()
    renderCheckIn()
    await userEvent.type(field(), 'AB34CD{Enter}')
    const card = await screen.findByTestId('lookup-result')
    await userEvent.click(within(card).getByRole('button', { name: '진료 대기' }))
    await waitFor(() => expect(statusBodies).toHaveLength(2))
    expect(statusBodies[0].body).toEqual({ new_status: '도착', expected_updated_at: 'T1' })
    expect(statusBodies[1].body).toEqual({ new_status: '진료대기', expected_updated_at: 'T2' })
    expect(await within(screen.getByTestId('lookup-result')).findByText('진료 대기')).toBeVisible()
  })

  test('[CHKIN-RESULT-04] 완료 뒤 [대기 목록에서 보기]를 눌러야만 그 줄이 보이는 탭으로 간다', async () => {
    onLookup(found(foundCard({ status: '예약확정' })))
    onStatus()
    renderCheckIn()
    await userEvent.type(field(), 'AB34CD{Enter}')
    const card = await screen.findByTestId('lookup-result')
    await userEvent.click(within(card).getByRole('button', { name: '도착' }))
    const done = await screen.findByRole('button', { name: '대기 목록에서 보기' })
    expect(screen.queryByTestId('location')).toBeNull() // 결정 #6 — 성공해도 머문다
    await userEvent.click(done)
    expect(screen.getByTestId('location')).toHaveTextContent('/queue?tab=arrived&appointment=a1')
  })

  test('[CHKIN-RESULT-04] 새 조회는 이전 카드를 먼저 지우고, 늦게 온 이전 응답은 버린다', async () => {
    server.use(
      http.get('*/appointments/find-by-code', async ({ request }) => {
        const code = new URL(request.url).searchParams.get('code')
        if (code === 'AB34CD') {
          await delay(80)
          return HttpResponse.json({ appointment: foundCard({ appointment_id: 'a1', patient_name: '김민정' }) })
        }
        return HttpResponse.json({ appointment: foundCard({ appointment_id: 'a2', patient_name: '이서준' }) })
      }),
    )
    renderCheckIn()
    await userEvent.type(field(), 'AB34CD{Enter}') // 느린 조회 시작
    await userEvent.clear(field())
    await userEvent.type(field(), 'EF56GH{Enter}') // 빠른 조회가 먼저 도착
    expect(await screen.findByText('이서준')).toBeVisible()
    await act(async () => { await delay(120) }) // 느린 이전 응답이 이제 도착
    expect(screen.queryByText('김민정')).toBeNull() // 늦은 응답은 버린다(SEARCH-RUN-04·05)
  })
})

describe('CheckInPage — 연결(CHKIN-LOAD-*)', () => {
  test('[CHKIN-LOAD-01] 연결이 없으면 공통 띠가 뜨고 조회 버튼이 잠기되 입력값은 남는다', async () => {
    renderCheckIn()
    await userEvent.type(field(), 'AB34CD')
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(await screen.findByText('인터넷이 연결되어 있지 않습니다')).toBeVisible()
    expect(screen.getByRole('button', { name: '예약번호로 찾기' })).toBeDisabled()
    expect(field()).toHaveValue('AB34CD')
  })
})
