import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import { AppShell } from '../AppShell'
import { ConnectivityProvider } from '../../lib/connectivity'
import { queryClient } from '../../lib/queryClient'
import { server } from '../../test/msw/server'

// 등록 문(`SHELL-DOOR-03`) 배선 — 데모 뼈대는 그대로 두고 저장·중복조회만 진짜 서버로 간다.
// 여기서 보는 계약: ①폼이 그대로 서버로 간다 ②소프트 중복은 **막지 않는다** ③표시값은
// **서버가 가려서** 준다(화면이 다시 가리지 않는다) ④실패해도 막다른 길이 아니다.
const staff = { staffId: 's1', name: '김직원', email: 'kim@hospital.kr', role: 'receptionist' as const, departmentId: null, departmentName: null }

vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ staff, logout: vi.fn() }) }))
vi.mock('../../auth/useIdleLogout', () => ({ useIdleLogout: () => ({ isWarning: false, keepAlive: vi.fn() }) }))

function renderShell() {
  queryClient.clear()
  return render(
    <QueryClientProvider client={queryClient}>
      <ConnectivityProvider>
        <MemoryRouter initialEntries={['/queue']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/queue" element={<p>대기 목록 본문</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ConnectivityProvider>
    </QueryClientProvider>,
  )
}

/** 겹치는 기록이 없는 평소 상태 — 등록만 성공한다. */
function seedNoDuplicate(onRegister?: (body: unknown) => void) {
  server.use(
    http.get('/patients/duplicate-check', () =>
      HttpResponse.json({ patient_id: null, masked_name: null, masked_birth_date: null }),
    ),
    http.post('/patients', async ({ request }) => {
      onRegister?.(await request.json())
      return HttpResponse.json({ patient_id: 'p-new-1' }, { status: 201 })
    }),
  )
}

/** 등록 문을 열고 신원 폼을 채운다(이름·성별·생년월일 8자리·전화). */
async function openRegisterAndFill(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '등록' }))
  await user.type(screen.getByLabelText('이름'), '이신규')
  await user.click(screen.getByRole('button', { name: '여' }))
  await user.type(screen.getByLabelText('생년월일'), '19750820')
  await user.type(screen.getByLabelText('전화번호'), '01055556666')
}

/** 확인창 안의 [등록] — 헤더 세 문의 [등록] 버튼과 이름이 같아 대화상자 안에서만 찾는다. */
function confirmButton(name: string | RegExp = '등록') {
  return within(screen.getByRole('dialog')).getByRole('button', { name })
}

test('[SHELL-DOOR-03] 신원 폼을 확인창으로 확인하면 그대로 서버에 등록된다', async () => {
  const user = userEvent.setup()
  const sent: unknown[] = []
  seedNoDuplicate((body) => sent.push(body))
  renderShell()

  await openRegisterAndFill(user)
  await user.click(screen.getByRole('button', { name: '새 환자 등록' }))
  await user.click(confirmButton())

  await waitFor(() => expect(sent).toHaveLength(1))
  // 생년월일 8자리는 ISO 날짜로 옮겨 보낸다 — 화면의 자동서식이 계약을 바꾸지 않는다.
  expect(sent[0]).toEqual({ name: '이신규', gender: '여', birth_date: '1975-08-20', phone: '01055556666' })
})

test('[SHELL-DOOR-05] 등록을 마치면 막다른 길이 아니라 [예약 잡기]·[바로 접수]로 이어진다', async () => {
  const user = userEvent.setup()
  seedNoDuplicate()
  renderShell()

  await openRegisterAndFill(user)
  await user.click(screen.getByRole('button', { name: '새 환자 등록' }))
  await user.click(confirmButton())

  expect(await screen.findByText('새 환자로 등록했습니다')).toBeVisible()
  await user.click(screen.getByRole('button', { name: /바로 접수/ }))
  expect(screen.getByRole('complementary', { name: '접수' })).toBeVisible()
})

test('[BTN-BUSY-01][BTN-BUSY-02] 등록 중에는 라벨이 남은 채 바뀌고, 다시 눌러도 한 번만 보낸다', async () => {
  const user = userEvent.setup()
  let calls = 0
  let release: (() => void) | undefined
  const held = new Promise<void>((resolve) => { release = resolve })
  server.use(
    http.get('/patients/duplicate-check', () =>
      HttpResponse.json({ patient_id: null, masked_name: null, masked_birth_date: null }),
    ),
    http.post('/patients', async () => {
      calls += 1
      await held
      return HttpResponse.json({ patient_id: 'p-new-1' }, { status: 201 })
    }),
  )
  renderShell()

  await openRegisterAndFill(user)
  await user.click(screen.getByRole('button', { name: '새 환자 등록' }))
  await user.click(confirmButton())

  const busy = await waitFor(() => confirmButton('등록하는 중…'))
  await user.click(busy) // 두 번째 누름은 무시된다(BTN-BUSY-02)
  expect(calls).toBe(1)

  release?.()
  await screen.findByText('새 환자로 등록했습니다')
})

test('[ERR-POS-01][ERR-MSG-01] 등록이 실패하면 서버 문장을 버튼 위에 그대로 붙이고 다시 누를 수 있다', async () => {
  const user = userEvent.setup()
  server.use(
    http.get('/patients/duplicate-check', () =>
      HttpResponse.json({ patient_id: null, masked_name: null, masked_birth_date: null }),
    ),
    http.post('/patients', () =>
      HttpResponse.json({ detail: '지금은 저장할 수 없습니다. 잠시 후 다시 시도해주세요.' }, { status: 500 }),
    ),
  )
  renderShell()

  await openRegisterAndFill(user)
  await user.click(screen.getByRole('button', { name: '새 환자 등록' }))
  await user.click(confirmButton())

  expect(await screen.findByRole('alert')).toHaveTextContent('지금은 저장할 수 없습니다. 잠시 후 다시 시도해주세요.')
  // 막다른 길 금지 — 확인창이 열린 채 남아 그 자리에서 다시 누를 수 있다.
  expect(confirmButton()).toBeEnabled()
})

test('[SHELL-DOOR-03][MASK-SRV-01] 겹치는 기록이 있으면 서버가 가린 이름으로 소프트 확인만 하고 등록을 막지 않는다', async () => {
  const user = userEvent.setup()
  const sent: unknown[] = []
  server.use(
    http.get('/patients/duplicate-check', () =>
      HttpResponse.json({ patient_id: 'p-old-9', masked_name: '김*정', masked_birth_date: '1975-**-20' }),
    ),
    http.post('/patients', async ({ request }) => {
      sent.push(await request.json())
      return HttpResponse.json({ patient_id: 'p-new-1' }, { status: 201 })
    }),
  )
  renderShell()

  await openRegisterAndFill(user)

  // 화면은 서버가 준 가린 값을 그대로 쓴다 — 스스로 가리지 않는다(MASK-SRV-01).
  expect(await screen.findByText('김*정')).toBeVisible()

  // ⛔ 관문이 아니다 — 후보가 떠 있어도 등록 버튼은 그대로 눌린다(SHELL-DOOR-03).
  await user.click(screen.getByRole('button', { name: '새 환자 등록' }))
  await user.click(confirmButton())
  await waitFor(() => expect(sent).toHaveLength(1))
})

test('[SHELL-DOOR-03] [기존 기록 보기]를 누르면 그 환자를 안고 예약·접수로 이어간다', async () => {
  const user = userEvent.setup()
  server.use(
    http.get('/patients/duplicate-check', () =>
      HttpResponse.json({ patient_id: 'p-old-9', masked_name: '김*정', masked_birth_date: '1975-**-20' }),
    ),
  )
  renderShell()

  await openRegisterAndFill(user)
  await user.click(await screen.findByRole('button', { name: '기존 기록 보기' }))

  expect(screen.getByText('기존 환자를 찾았습니다')).toBeVisible()
  // 서버가 가린 값을 그대로 그린다 — 화면이 다시 가리지 않는다(MASK-SRV-01).
  expect(screen.getByText('1975-**-20 · 010-****-6666')).toBeVisible()
  expect(screen.getByRole('button', { name: /예약 잡기/ })).toBeVisible()
})

test('[SHELL-DOOR-03] 전화·생년이 다 차기 전에는 중복을 묻지 않는다(타이핑 도중 캐묻지 않는다)', async () => {
  const user = userEvent.setup()
  let asked = 0
  server.use(
    http.get('/patients/duplicate-check', () => {
      asked += 1
      return HttpResponse.json({ patient_id: null, masked_name: null, masked_birth_date: null })
    }),
  )
  renderShell()

  await user.click(screen.getByRole('button', { name: '등록' }))
  await user.type(screen.getByLabelText('이름'), '이신규')
  await user.type(screen.getByLabelText('생년월일'), '1975')

  expect(asked).toBe(0)
})
