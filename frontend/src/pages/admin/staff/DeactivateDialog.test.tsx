import { screen, waitFor, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { dialog, location, rowOf, setupStaff } from './testUtils'
import type { DeactivationImpact } from '../../../api/staff'

// [STAFF-DEACT-*·NAVX-STAFF-01] 의사 사용 중지 — 결정10 A안.

const impact3: DeactivationImpact = {
  count: 3,
  times: [
    { date: '2026-08-14', time: '09:30' },
    { date: '2026-08-15', time: '11:00' },
    { date: '2026-08-20', time: '14:00' },
  ],
  version: 'v1',
}

async function openDeactivate(user: UserEvent, name: string): Promise<void> {
  await user.click(within(rowOf(name)).getByRole('button', { name: '중지' }))
  await screen.findByRole('dialog')
}
async function confirmDeactivate(user: UserEvent): Promise<void> {
  await user.click(within(dialog()).getByRole('button', { name: '사용 중지' }))
}

test('[STAFF-DEACT-01] [중지]를 눌러도 팝업만 열고 아직 서버를 부르지 않는다', async () => {
  const { user, api } = setupStaff({ impact: impact3 })
  await screen.findByText('이민호')
  await openDeactivate(user, '이민호')
  expect(dialog()).toBeVisible()
  expect(api.calls('PATCH /staff/s-002/deactivate')).toHaveLength(0)
})

test('[STAFF-DEACT-02] 누구를 끄는지와 세션이 끊긴다는 것을 먼저 보인다', async () => {
  const { user } = setupStaff({ impact: impact3 })
  await screen.findByText('이민호')
  await openDeactivate(user, '이민호')
  expect(dialog()).toHaveTextContent('이민호 · 의사 · 내과')
  expect(dialog()).toHaveTextContent('사용 중지하면 이 계정의 모든 로그인 세션이 끊깁니다')
})

test('[STAFF-DEACT-02] 확인 전에 [취소]를 함께 둔다', async () => {
  const { user } = setupStaff({ impact: impact3 })
  await screen.findByText('이민호')
  await openDeactivate(user, '이민호')
  expect(within(dialog()).getByRole('button', { name: '취소' })).toBeVisible()
})

test('[STAFF-DEACT-04] 영향 예약은 건수·날짜·시각으로 보인다', async () => {
  const { user } = setupStaff({ impact: impact3 })
  await screen.findByText('이민호')
  await openDeactivate(user, '이민호')
  await waitFor(() => expect(dialog()).toHaveTextContent('확인 필요한 예약 3건'))
  expect(dialog()).toHaveTextContent('8월 14일 (금) 09:30')
})

test('[STAFF-DEACT-04] 영향 예약에 환자 이름·전화번호가 없다', async () => {
  const { user } = setupStaff({ impact: impact3 })
  await screen.findByText('이민호')
  await openDeactivate(user, '이민호')
  await waitFor(() => expect(dialog()).toHaveTextContent('확인 필요한 예약 3건'))
  expect(dialog()).not.toHaveTextContent('010')
})

test('[STAFF-DEACT-05] 0건이면 정책 안내 없이 「영향받는 미래 예약 없음」만 보인다', async () => {
  const { user } = setupStaff({ impact: { count: 0, times: [], version: 'v0' } })
  await screen.findByText('이민호')
  await openDeactivate(user, '이민호')
  await waitFor(() => expect(dialog()).toHaveTextContent('영향받는 미래 예약 없음'))
  expect(within(dialog()).queryByText(/확인 필요한 예약/)).toBeNull()
})

test('[STAFF-DEACT-06] 정책을 고르게 하지 않는다', async () => {
  const { user } = setupStaff({ impact: impact3 })
  await screen.findByText('이민호')
  await openDeactivate(user, '이민호')
  expect(within(dialog()).queryByText(/일괄 취소|일괄 재배정|정책/)).toBeNull()
})

test('[STAFF-DEACT-06] 확정 버튼이 잠겨 있지 않다', async () => {
  const { user } = setupStaff({ impact: impact3 })
  await screen.findByText('이민호')
  await openDeactivate(user, '이민호')
  expect(within(dialog()).getByRole('button', { name: '사용 중지' })).toBeEnabled()
})

test('[STAFF-DEACT-07][NAVX-STAFF-01] 확정 뒤 갈 길이 /today 확인 필요 카드임을 말해 준다', async () => {
  const { user } = setupStaff({ impact: impact3 })
  await screen.findByText('이민호')
  await openDeactivate(user, '이민호')
  await confirmDeactivate(user)
  expect(await screen.findByRole('status')).toHaveTextContent(
    '확인 필요한 예약 3건은 오늘의 현황에서 처리합니다',
  )
})

test('[STAFF-DEACT-07][NAVX-STAFF-01] 「오늘의 현황으로」 링크가 /today로 데려간다', async () => {
  const { user } = setupStaff({ impact: impact3 })
  await screen.findByText('이민호')
  await openDeactivate(user, '이민호')
  await confirmDeactivate(user)
  await user.click(await screen.findByRole('link', { name: '오늘의 현황으로 ›' }))
  expect(location()).toBe('/today')
})

test('[STAFF-DEACT-08] 확정이 환자 알림을 부르지 않는다', async () => {
  const { user, api } = setupStaff({ impact: impact3 })
  await screen.findByText('이민호')
  await openDeactivate(user, '이민호')
  await confirmDeactivate(user)
  await waitFor(() => expect(api.calls('PATCH /staff/s-002/deactivate')).toHaveLength(1))
  expect(api.calls(/notify|messages/)).toHaveLength(0)
})

test('[STAFF-DEACT-03] 보호 409는 사람이 읽을 문장으로 그 자리에 남는다', async () => {
  const { user, api } = setupStaff({ impact: { count: 0, times: [], version: 'v0' } })
  await screen.findByText('최운영')
  api.respond('PATCH /staff/s-004/deactivate', 409, '마지막 남은 관리자는 중지할 수 없습니다.')
  await openDeactivate(user, '최운영')
  await confirmDeactivate(user)
  expect(await within(dialog()).findByText('마지막 남은 관리자는 중지할 수 없습니다.')).toBeVisible()
  expect(dialog()).toBeVisible()
})

test('[STAFF-DEACT-09] 그 사이 예약이 늘면 409를 받고 [다시 확인]으로 최신을 읽는다', async () => {
  const { user, api } = setupStaff({
    impact: impact3,
    impactAfterConflict: { count: 4, times: impact3.times, version: 'v2' },
  })
  await screen.findByText('이민호')
  api.respond('PATCH /staff/s-002/deactivate', 409, '최신 상태가 바뀌었습니다')
  await openDeactivate(user, '이민호')
  await confirmDeactivate(user)
  expect(await within(dialog()).findByText('최신 상태가 바뀌었습니다')).toBeVisible()
  await user.click(within(dialog()).getByRole('button', { name: '다시 확인' }))
  await waitFor(() => expect(dialog()).toHaveTextContent('확인 필요한 예약 4건'))
})

test('[STAFF-DEACT-10] 성공하면 그 줄이 중지됨이 되고 [중지] 버튼이 사라진다', async () => {
  const { user } = setupStaff({ impact: impact3 })
  await screen.findByText('이민호')
  await openDeactivate(user, '이민호')
  await confirmDeactivate(user)
  await waitFor(() => expect(rowOf('이민호')).toHaveTextContent('중지됨'))
  expect(within(rowOf('이민호')).queryByRole('button', { name: '중지' })).toBeNull()
})
