import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import { AppShell } from '../AppShell'
import { ConnectivityProvider } from '../../lib/connectivity'
import { queryClient } from '../../lib/queryClient'
import { server } from '../../test/msw/server'

// 접수 문(`SHELL-DOOR-04`) 배선 — 「예약 확인」 갈래는 `/checkin`과 **같은 컴포넌트**(CheckinForm)다.
// 여기서 보는 것은 문에서만 확인할 수 있는 것들: ①자리표시자가 아니라 진짜 폼이 붙었나
// ②떠날 때 패널을 닫고 가나(`PANEL-ONE-01` — 대기 목록 위에 문이 남아 있으면 안 된다).
// 폼 자체의 규칙(CHKIN-*)은 `pages/checkin/CheckInPage.test.tsx`가 지킨다 — 여기서 겹쳐 세지 않는다.
//
// 「예약 없이 오신 분」 갈래(D3 후반)는 여기서만 확인할 수 있다 — 한 화면(`QUEUE-WALK-02`)이고
// 서버 창구가 `POST /appointments/walkin` 하나다(진료과는 서버가 도출, `QUEUE-WALK-08e`).
const staff = { staffId: 's1', name: '김직원', email: 'kim@hospital.kr', role: 'receptionist' as const, departmentId: null, departmentName: null }

vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ staff, logout: vi.fn() }) }))
vi.mock('../../auth/useIdleLogout', () => ({ useIdleLogout: () => ({ isWarning: false, keepAlive: vi.fn() }) }))

function Probe() {
  const loc = useLocation()
  return <p>주소 {loc.pathname + loc.search}</p>
}

function renderShell() {
  queryClient.clear()
  return render(
    <QueryClientProvider client={queryClient}>
      <ConnectivityProvider>
        <MemoryRouter initialEntries={['/today']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/today" element={<p>오늘의 현황 본문</p>} />
              <Route path="/queue" element={<Probe />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ConnectivityProvider>
    </QueryClientProvider>,
  )
}

function panel() {
  return screen.getByRole('complementary', { name: '접수' })
}

test('[SHELL-DOOR-04] 접수 문의 「예약 확인」 갈래는 진짜 조회 폼이다 — 자리표시자가 아니다', async () => {
  const user = userEvent.setup()
  renderShell()
  await user.click(screen.getByRole('button', { name: '접수' }))

  expect(within(panel()).getByRole('button', { name: 'QR 스캔 시작' })).toBeVisible()
  expect(within(panel()).getByLabelText('QR이 없나요? 예약번호 직접 입력')).toBeVisible()
})

test('[CHKIN-RESULT-01] 문 안에서 조회하면 그 자리 카드로 확인한다 — 화면을 떠나지 않는다', async () => {
  const user = userEvent.setup()
  server.use(
    http.get('*/appointments/find-by-code', () =>
      HttpResponse.json({
        appointment: {
          appointment_id: 'a1',
          patient_name: '김민정',
          slot_at: '2026-08-28T01:30:00+00:00',
          department_name: '내과',
          doctor_name: '김의사',
          status: '예약확정',
          updated_at: 'T1',
        },
      }),
    ),
  )
  renderShell()
  await user.click(screen.getByRole('button', { name: '접수' }))
  await user.type(within(panel()).getByLabelText('QR이 없나요? 예약번호 직접 입력'), 'AB34CD{Enter}')

  const card = await screen.findByTestId('lookup-result')
  expect(within(card).getByText('김민정')).toBeVisible()
  expect(screen.getByText('오늘의 현황 본문')).toBeVisible() // 왼쪽은 보던 화면 그대로
})

test('[PANEL-ONE-01] 대기 목록으로 떠날 때 문을 닫고 간다 — 다음 화면 위에 패널이 남지 않는다', async () => {
  const user = userEvent.setup()
  renderShell()
  await user.click(screen.getByRole('button', { name: '접수' }))
  await user.click(within(panel()).getByRole('button', { name: '대기 목록으로' }))

  expect(screen.getByText('주소 /queue?tab=not_arrived')).toBeVisible()
  expect(screen.queryByRole('complementary', { name: '접수' })).toBeNull()
})


// ── 예약 없이 오신 분(당일 방문) ─────────────────────────────────────────────

function serveDoctors() {
  server.use(
    http.get('*/today/summary', () =>
      HttpResponse.json({
        tiles: {},
        long_wait: [],
        needs_attention: [],
        not_arrived: [],
        yesterday_unfinished: [],
        doctor_waiting: [
          { doctor_id: 'd1', doctor_name: '이정훈', department_name: '내과', waiting_count: 3 },
          { doctor_id: 'd7', doctor_name: '서지훈', department_name: '내과', waiting_count: 0 },
          { doctor_id: 'd3', doctor_name: '박강우', department_name: '정형외과', waiting_count: 2 },
        ],
        badge_excluded_patient_ids: [],
        bot_pending: null,
      }),
    ),
  )
}

function servePatient() {
  server.use(
    http.get('*/patients', () =>
      HttpResponse.json({
        rows: [{
          patient_id: 'p1',
          name: '김태호',
          masked_phone: '010-****-9930',
          masked_birth_date: '1972-**-03',
          gender: 'M',
          matched: ['name'],
          today_status: null,
          today_appointment_time: null,
        }],
        next_cursor: null,
        has_more: false,
      }),
    ),
  )
}

/** 접수 문을 열고 「예약 없이 오신 분」으로 넘어가 환자·의사를 고른 상태까지. */
async function openWalkin(user: ReturnType<typeof userEvent.setup>) {
  serveDoctors()
  servePatient()
  renderShell()
  await user.click(screen.getByRole('button', { name: '접수' }))
  await user.click(within(panel()).getByRole('button', { name: '예약 없이 오신 분' }))
}

async function pickPatientAndDoctor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(panel()).getByRole('button', { name: /환자를 찾아 고르세요/ }))
  await user.click(screen.getByRole('textbox', { name: '환자 검색' }))
  await user.paste('김태호')
  await user.keyboard('{Enter}')
  await user.click(await waitFor(() => screen.getByRole('button', { name: /김태호/ })))
  await user.click(await within(panel()).findByRole('button', { name: /이정훈/ }))
}

/** 「지난 날」 칸을 어제로 채운다 — 언제 돌려도 지난 시각이 되게. */
async function setYesterday(user: ReturnType<typeof userEvent.setup>) {
  const y = new Date(Date.now() - 86400000)
  const iso = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`
  const box = within(panel()).getByLabelText('방문한 날짜')
  await user.clear(box)
  await user.type(box, iso)
}

test('[QUEUE-WALK-08b][QUEUE-WALK-08e] 의사는 실제 대기 인원으로 고르고, 진료과는 묶음 머리로만 나온다', async () => {
  const user = userEvent.setup()
  await openWalkin(user)
  await user.click(within(panel()).getByRole('button', { name: /덜 기다리는 의사로 배정하세요/ }))

  const list = panel()
  expect(await within(list).findByText('내과')).toBeVisible()
  expect(within(list).getByText('정형외과')).toBeVisible()
  // 대기 인원이 줄에 붙는다 — 창구에서 「어느 선생님이 덜 기다리나」로 고른다.
  expect(within(list).getByRole('button', { name: /이정훈.*대기 3명/ })).toBeVisible()
  expect(within(list).getByRole('button', { name: /서지훈.*대기 없음/ })).toBeVisible()
  // ⛔ 진료과는 누르는 필터가 아니다 — 묶음 머리는 버튼이 아니다.
  expect(within(list).queryByRole('button', { name: '내과' })).toBeNull()
})

test('[QUEUE-WALK-19] 한 화면이다 — ①환자 ②담당 의사 ③오신 시각이 위에서 아래로 함께 있다', async () => {
  const user = userEvent.setup()
  await openWalkin(user)

  const p = panel()
  expect(within(p).getByText('환자')).toBeVisible()
  expect(within(p).getByText('담당 의사 배정')).toBeVisible()
  expect(within(p).getByText('오신 시각')).toBeVisible()
  // [QUEUE-WALK-14] 기본이 「지금」이라 평소에는 손댈 것이 없다.
  expect(within(p).getByRole('radio', { name: '지금' })).toBeChecked()
})

test('[QUEUE-WALK-14b][QUEUE-WALK-14c] 콜론을 안 쳐도 된다 — 905는 09:05로 읽는다', async () => {
  const user = userEvent.setup()
  await openWalkin(user)
  // ⚠️ 「오늘 09:05」는 새벽에 돌리면 아직 오지 않은 시각이라 테스트가 시계에 흔들린다 —
  //    어제로 적어 언제 돌려도 지난 시각이게 한다(`QUEUE-WALK-16`은 별도 테스트가 본다).
  await user.click(within(panel()).getByRole('radio', { name: '지난 날' }))
  await setYesterday(user)
  await user.type(within(panel()).getByRole('textbox', { name: '방문한 시각' }), '905')

  expect(await within(panel()).findByText('09:05에 오신 것으로 적습니다')).toBeVisible()
})

test('[QUEUE-WALK-14e] 지금보다 뒤를 치면 그 자리에서 바로 알리고, 친 값을 지우지 않는다', async () => {
  const user = userEvent.setup()
  await openWalkin(user)
  await user.click(within(panel()).getByRole('radio', { name: '지금' })) // 기본 확인
  await user.click(within(panel()).getByRole('radio', { name: '지난 시각 — 오늘' }))
  const box = within(panel()).getByRole('textbox', { name: '방문한 시각' })
  await user.type(box, '2358')

  expect(await within(panel()).findByText('아직 오지 않은 시각입니다')).toBeVisible()
  expect(box).toHaveValue('2358') // 고칠 수 있게 남긴다
})

test('[QUEUE-WALK-09][QUEUE-WALK-11] 저장 직전 이름·생년월일을 보여주고 「맨 뒤에 들어간다」고 알린다', async () => {
  const user = userEvent.setup()
  await openWalkin(user)
  await pickPatientAndDoctor(user)
  await user.click(within(panel()).getByRole('button', { name: '진료 대기로 접수' }))

  const dialog = await screen.findByRole('dialog', { name: '이 환자를 접수할까요?' })
  expect(within(dialog).getByText('김태호')).toBeVisible()
  expect(within(dialog).getByText('1972-**-03')).toBeVisible()
  expect(within(dialog).getByText('추가하면 「진료 대기」 맨 뒤에 들어갑니다.')).toBeVisible()
})

test('[QUEUE-WALK-08e][QUEUE-WALK-14] 접수하면 진료과 없이 의사만 보내고, 「지금」은 시각을 안 싣는다', async () => {
  const user = userEvent.setup()
  const sent: Record<string, unknown>[] = []
  server.use(
    http.post('*/appointments/walkin', async ({ request }) => {
      sent.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json({ appointment_id: 'a-new' })
    }),
  )
  await openWalkin(user)
  await pickPatientAndDoctor(user)
  await user.click(within(panel()).getByRole('button', { name: '진료 대기로 접수' }))
  // 헤더의 「접수」 문 버튼과 이름이 겹친다 — 확인창 안으로 좁힌다.
  const dialog = await screen.findByRole('dialog', { name: '이 환자를 접수할까요?' })
  await user.click(within(dialog).getByRole('button', { name: '접수' }))

  await waitFor(() => expect(sent).toHaveLength(1))
  expect(sent[0]).toMatchObject({ patient_id: 'p1', doctor_id: 'd1' })
  expect(sent[0]).not.toHaveProperty('department_id')
  expect(sent[0].visit_time).toBeNull()
})

test('[QUEUE-WALK-14d] 직원이 적은 지난 시각은 5분 격자에 붙이지 않고 그대로 보낸다', async () => {
  const user = userEvent.setup()
  const sent: Record<string, unknown>[] = []
  server.use(
    http.post('*/appointments/walkin', async ({ request }) => {
      sent.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json({ appointment_id: 'a-new' })
    }),
  )
  await openWalkin(user)
  await pickPatientAndDoctor(user)
  // 어제로 적어 「지금보다 뒤」에 걸리지 않게 한다.
  await user.click(within(panel()).getByRole('radio', { name: '지난 날' }))
  await setYesterday(user)
  await user.type(within(panel()).getByRole('textbox', { name: '방문한 시각' }), '1007')
  await user.click(within(panel()).getByRole('button', { name: '진료 대기로 접수' }))
  // 헤더의 「접수」 문 버튼과 이름이 겹친다 — 확인창 안으로 좁힌다.
  const dialog = await screen.findByRole('dialog', { name: '이 환자를 접수할까요?' })
  await user.click(within(dialog).getByRole('button', { name: '접수' }))

  await waitFor(() => expect(sent).toHaveLength(1))
  // 10:07이 10:05로 붙지 않았다 — 방문 기록은 붙이는 순간 거짓이 된다.
  expect(new Date(sent[0].visit_time as string).getMinutes()).toBe(7)
})
