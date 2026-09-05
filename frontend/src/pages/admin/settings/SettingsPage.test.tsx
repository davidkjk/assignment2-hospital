import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import { server } from '../../../test/msw/server'
import { SettingsPage } from './SettingsPage'
import type { Settings } from '../../../api/settings'

// jsdom엔 scrollIntoView가 없다 — InlineError가 useEffect에서 부르므로 stub한다(다른 화면 testUtils와 동일).
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = vi.fn()

function baseSettings(over: Partial<Settings> = {}): Settings {
  const notifications = {
    requested: { body: '접수됨', is_default: true, send_sms: false },
    confirmed: { body: '확정됨', is_default: true, send_sms: false },
    reminder_day_before: { body: '전날', is_default: true, send_sms: false },
    reminder_today: { body: '당일', is_default: true, send_sms: false },
    changed: { body: '변경됨', is_default: true, send_sms: false },
    hospital_cancelled: { body: '병원취소', is_default: true, send_sms: false },
    cancellation_approved: { body: '취소처리', is_default: true, send_sms: false },
    cancellation_rejected: { body: '상담연결', is_default: true, send_sms: false },
    questionnaire_missing: { body: '문진요청', is_default: true, send_sms: false },
    visit_completed: { body: '진료완료', is_default: true, send_sms: false },
  } as Settings['notifications']
  return {
    cancellation_deadline_hours: 24,
    long_wait_threshold_minutes: 30,
    booking_window_weeks: 8,
    auto_confirm_app_bookings: true,
    hospital_address: '',
    hospital_phone: '',
    sms_enabled: true,
    sms_recipients: 'app_only',
    sms_opt_out_number: null,
    version: 1,
    sms_provider_connected: false,
    notifications,
    upcoming_closures: [{ closure_date: '2026-09-01', memo: '추석' }],
    recent_changes: {},
    ...over,
  }
}

let lastPut: { patch: Record<string, unknown>; base_version: number } | null = null
let putStatus = 200

function mockApi(settings: Settings, opts: { previewCount?: number; windowCount?: number } = {}) {
  lastPut = null
  putStatus = 200
  server.use(
    http.get('*/admin/settings/preview-cancellation', () =>
      HttpResponse.json({ count: opts.previewCount ?? 0 })),
    http.get('*/admin/settings/preview-booking-window', () =>
      HttpResponse.json({ count: opts.windowCount ?? 0 })),
    http.get('*/admin/settings', () => HttpResponse.json(settings)),
    http.put('*/admin/settings', async ({ request }) => {
      lastPut = (await request.json()) as { patch: Record<string, unknown>; base_version: number }
      if (putStatus !== 200) return HttpResponse.json({ detail: '다른 관리자가 먼저 저장했습니다. 최신 값을 확인해 주세요.' }, { status: putStatus })
      return HttpResponse.json({ ok: true, version: settings.version + 1 })
    }),
  )
}

function renderSettings(props: { role?: 'admin' | 'receptionist' | 'doctor'; settings?: Partial<Settings>; windowCount?: number } = {}) {
  mockApi(baseSettings(props.settings), { previewCount: 3, windowCount: props.windowCount ?? 0 })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<SettingsPage role={props.role ?? 'admin'} />} />
          <Route path="/admin/schedule" element={<div>진료 일정 관리 화면</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return utils
}

const user = userEvent.setup()

function menu(name: string) {
  return screen.getByRole('button', { name: new RegExp(name) })
}
function sideMenu() {
  return screen.getAllByRole('button').filter((b) => b.getAttribute('data-menu')).map((b) => b.getAttribute('data-menu'))
}
function activeMenu() {
  return screen.getByRole('button', { current: true }).getAttribute('data-menu')
}
function field(name: string) {
  return screen.getByLabelText(new RegExp(name)) as HTMLInputElement
}
function saveButton() {
  return screen.getByRole('button', { name: '저장' })
}
async function ready() {
  await screen.findByText('예약 규칙')
}

beforeEach(() => {
  lastPut = null
  putStatus = 200
})

test('[HSET-NAV-01][HSET-NAV-04] 왼쪽 다섯 세로 메뉴, 첫 줄은 늘 예약 규칙', async () => {
  renderSettings()
  await ready()
  expect(sideMenu()).toEqual(['예약 규칙', '대기실 운영', '문자 발송', '자동 알림', '병원 정보'])
  expect(activeMenu()).toBe('예약 규칙')
})

test('[HSET-NAV-05][HSET-MSG-33] 관리자가 아니면 설정 화면이 없다', async () => {
  renderSettings({ role: 'receptionist' })
  expect(screen.queryByText('예약 규칙')).toBeNull()
})

test('[HSET-NAV-02] 메뉴는 세로줄이라 가로 탭을 쓰지 않는다', async () => {
  renderSettings()
  await ready()
  expect(screen.queryByRole('tab')).toBeNull()
})

test('[HSET-SAVE-02][HSET-SAVE-03] 값을 고치면 맨 위에 저장하지 않은 변경 요약이 뜬다', async () => {
  renderSettings()
  await ready()
  await user.clear(field('취소 마감'))
  await user.type(field('취소 마감'), '48')
  expect(screen.getByText(/저장하지 않은 변경 1곳/)).toBeVisible()
})

test('[HSET-BOOK-05][HSET-BOOK-06] 앱 예약 자동확정을 끄면 직원 확인 안내가 뜬다', async () => {
  renderSettings()
  await ready()
  await user.click(field('앱 예약 자동확정'))
  expect(screen.getByText('꺼짐 — 직원이 확인한 뒤 확정됩니다')).toBeVisible()
})

test('[HSET-WAIT-01][HSET-WAIT-03] 오래 대기 표시를 끄면 분 입력칸이 잠기고 값은 보존된다', async () => {
  renderSettings()
  await ready()
  await user.click(menu('대기실 운영'))
  expect(field('분 이상')).toHaveValue(30)
  await user.click(screen.getByRole('checkbox', { name: /오래 기다리는 환자 표시/ }))
  expect(field('분 이상')).toBeDisabled()
  await user.click(screen.getByRole('checkbox', { name: /오래 기다리는 환자 표시/ }))
  expect(field('분 이상')).toHaveValue(30)
})

test('[HSET-MSG-02][HSET-MSG-06][HSET-MSG-07] 자동 알림은 정확히 10줄, 종류·문구·문자로도 세 열', async () => {
  renderSettings()
  await ready()
  await user.click(menu('자동 알림'))
  expect(screen.getAllByTestId(/^msg-row-/)).toHaveLength(10)
  const row = screen.getByTestId('msg-row-confirmed')
  expect(within(row).getByRole('textbox')).toBeVisible()
  expect(within(row).getByRole('checkbox', { name: /문자도 발송/ })).toBeVisible()
})

test('[HSET-MSG-16] 토큰 버튼을 누르면 문구 칸에 그대로 꽂힌다', async () => {
  renderSettings()
  await ready()
  await user.click(menu('자동 알림'))
  const row = screen.getByTestId('msg-row-confirmed')
  await user.click(within(row).getByRole('button', { name: '시각' }))
  expect((within(row).getByRole('textbox') as HTMLTextAreaElement).value).toContain('{시각}')
})

test('[HSET-MSG-22] 고친 줄에만 기본 문구로 되돌리기 버튼이 있다', async () => {
  renderSettings({ settings: { notifications: { ...baseSettings().notifications, confirmed: { body: '고친 문구', is_default: false, send_sms: false } } } })
  await ready()
  await user.click(menu('자동 알림'))
  expect(within(screen.getByTestId('msg-row-confirmed')).getByRole('button', { name: /기본 문구로/ })).toBeVisible()
  expect(within(screen.getByTestId('msg-row-requested')).queryByRole('button', { name: /기본 문구로/ })).toBeNull()
})

test('[HSET-MSG-27][HSET-MSG-30][HSET-SMS-02c] 문자가 꺼져 있으면 문자도 발송 열이 잠기고 띠+이동 버튼이 뜬다', async () => {
  renderSettings({ settings: { sms_enabled: false } })
  await ready()
  await user.click(menu('자동 알림'))
  expect(within(screen.getByTestId('msg-row-confirmed')).getByRole('checkbox', { name: /문자도 발송/ })).toBeDisabled()
  expect(screen.getByText(/문자 발송이 꺼져 있어/)).toBeVisible()
  await user.click(screen.getByRole('button', { name: /문자 발송 설정으로/ }))
  expect(activeMenu()).toBe('문자 발송')
})

test('[HSET-SMS-02] 문자를 끄면 누구에게 칸이 잠긴다', async () => {
  renderSettings()
  await ready()
  await user.click(menu('문자 발송'))
  await user.click(field('문자 발송 사용'))
  expect(field('누구에게')).toBeDisabled()
})

test('[HSET-INFO-02][HSET-INFO-03][HSETX-NAV-01] 병원 정보엔 안내 문구·읽기 전용 휴무·관리 링크', async () => {
  renderSettings()
  await ready()
  await user.click(menu('병원 정보'))
  expect(screen.getByText('환자 앱에 그대로 보입니다')).toBeVisible()
  expect(field('주소')).toBeEnabled()
  expect(screen.getByText(/추석/)).toBeVisible()
  expect(screen.getByRole('link', { name: /관리/ })).toBeVisible()
})

test('[HSET-INFO-04] 휴무는 여기서 못 넣는다 — 넣는 자리를 둘로 두지 않는다', async () => {
  renderSettings()
  await ready()
  await user.click(menu('병원 정보'))
  expect(screen.queryByRole('button', { name: /휴무 추가|휴무일 넣기/ })).toBeNull()
})

test('[HSETX-VALID-01] 취소 마감 200은 인라인 오류로 막고 저장하지 않는다', async () => {
  renderSettings()
  await ready()
  await user.clear(field('취소 마감'))
  await user.type(field('취소 마감'), '200')
  await user.click(saveButton())
  expect(screen.getByText(/0~168시간/)).toBeVisible()
  expect(lastPut).toBeNull()
})

test('[HSET-SAVE-06][HSET-SAVE-08] 취소 마감이 바뀐 저장만 N건 확인창 + 자동 알림 없음 문구', async () => {
  renderSettings()
  await ready()
  await user.clear(field('취소 마감'))
  await user.type(field('취소 마감'), '48')
  await user.click(saveButton())
  const dlg = await screen.findByRole('dialog')
  expect(dlg).toHaveTextContent(/3건/)
  expect(dlg).toHaveTextContent(/자동으로 알림이 나가지는 않습니다/)
  await user.click(within(dlg).getByRole('button', { name: '저장' }))
  await waitFor(() => expect(lastPut?.patch.cancellation_deadline_hours).toBe(48))
})

test('[SCHED-WINDOW-05] 예약 기간을 줄이면 유지될 예약 건수 확인창을 거친다', async () => {
  renderSettings({ windowCount: 5 })
  await ready()
  await user.clear(field('예약 가능 기간'))
  await user.type(field('예약 가능 기간'), '4')   // 8 → 4주(줄임)
  await user.click(saveButton())
  const dlg = await screen.findByRole('dialog')
  expect(dlg).toHaveTextContent(/5건/)
  expect(dlg).toHaveTextContent(/그대로 유지됩니다/)
  await user.click(within(dlg).getByRole('button', { name: '저장' }))
  await waitFor(() => expect(lastPut?.patch.booking_window_weeks).toBe(4))
})

test('[SCHED-WINDOW-05] 예약 기간을 늘리면 확인창 없이 바로 저장된다', async () => {
  renderSettings()
  await ready()
  await user.clear(field('예약 가능 기간'))
  await user.type(field('예약 가능 기간'), '12')  // 8 → 12주(늘림)
  await user.click(saveButton())
  await waitFor(() => expect(lastPut?.patch.booking_window_weeks).toBe(12))
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('[HSET-SAVE-07] 취소 마감이 안 바뀐 저장은 확인창 없이 바로 저장된다', async () => {
  renderSettings()
  await ready()
  await user.click(menu('병원 정보'))
  await user.type(field('주소'), '서울시')
  await user.click(saveButton())
  await waitFor(() => expect(lastPut?.patch.hospital_address).toBe('서울시'))
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('[HSET-SAVE-07][G1] 저장이 성공하면 「저장했습니다」가 뜨고, 다시 고치면 사라진다', async () => {
  renderSettings()
  await ready()
  await user.click(menu('병원 정보'))
  await user.type(field('주소'), '서울시')
  await user.click(saveButton())
  // 저장 성공 — 배지만 조용히 사라지는 게 아니라 명시적으로 확인해 준다(프로필과 같은 처방).
  await screen.findByText('저장했습니다.')
  expect(screen.getByRole('status')).toHaveTextContent('저장했습니다.')
  // 다시 고치기 시작하면 낡은 성공 표시를 지운다.
  await user.type(field('주소'), '강남구')
  expect(screen.queryByText('저장했습니다.')).toBeNull()
})

test('[HSETX-STATE-03][HSETX-UNDO-01] 409면 안내를 띄우고 내 초안을 보존, 되돌리기는 서버값으로', async () => {
  renderSettings()
  await ready()
  putStatus = 409
  await user.clear(field('취소 마감'))
  await user.type(field('취소 마감'), '12')
  await user.click(saveButton())
  // 취소 마감이 바뀌었으니 확인창을 거친다 → 확인창의 [저장]에서 실제 PUT이 나가고 409를 받는다.
  const dlg = await screen.findByRole('dialog')
  await user.click(within(dlg).getByRole('button', { name: '저장' }))
  await screen.findByText(/다른 관리자가 먼저 저장했습니다/)
  expect(field('취소 마감')).toHaveValue(12)
  await user.click(screen.getByRole('button', { name: '되돌리기' }))
  expect(field('취소 마감')).toHaveValue(24)
})

test('[HSET-SAVE-05] 저장 전 화면을 떠나면 묻지 않고 날아간다(경고 없음)', async () => {
  renderSettings()
  await ready()
  await user.type(field('취소 마감'), '9')
  await user.click(menu('병원 정보'))
  expect(screen.queryByText(/저장하지 않고 나가면/)).toBeNull()
})
