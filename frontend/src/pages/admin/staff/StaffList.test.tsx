import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { chip, filterChips, leftColumn, rightColumn, rowNames, rowOf, setupStaff } from './testUtils'

// [STAFF-LIST-*·STAFF-ROW-*·STAFF-STATE-01] 직원 목록.
// 날짜 어휘가 절대 시각이라(STAFF-LIST-07) 기준 시각을 **병원 시각** 2026-08-27 12:00으로
// 고정한다(TIME-TZ-01) — 타임존 없는 리터럴은 그 기계의 시간대로 잡혀 판정이 어긋난다.
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-08-27T12:00:00+09:00'))
})
afterEach(() => vi.useRealTimers())

test('[STAFF-LIST-01] 중지된 직원도 목록에 남는다', async () => {
  setupStaff()
  expect(await screen.findByText('서하늘')).toBeVisible()
  expect(rowOf('서하늘')).toHaveTextContent('중지됨')
})

test('[STAFF-LIST-05] 중지된 직원 행에 [다시 사용] 버튼을 그리지 않는다', async () => {
  setupStaff()
  await screen.findByText('서하늘')
  expect(screen.queryByRole('button', { name: '다시 사용' })).toBeNull()
})

test('[STAFF-LIST-02] 재조회해도 목록 순서가 흔들리지 않는다', async () => {
  const { refetchList } = setupStaff()
  await screen.findByText('이민호')
  const first = rowNames()
  await refetchList()
  await waitFor(() => expect(rowNames()).toEqual(first))
})

test('[STAFF-LIST-03] 한 줄에 역할·소속이 있고 환자 마스킹(*)을 직원에게 쓰지 않는다', async () => {
  setupStaff()
  await screen.findByText('이민호')
  expect(rowOf('이민호')).toHaveTextContent('의사')
  expect(rowOf('이민호')).toHaveTextContent('내과')
  expect(rowOf('이민호')).not.toHaveTextContent('*')
})

test('[STAFF-LIST-04] 상태 칩이 건수를 달고 나온다', async () => {
  setupStaff()
  await screen.findByText('이민호')
  expect(filterChips()).toEqual(['전체 7', '활성 6', '중지됨 1'])
})

test('[STAFF-LIST-04] 중지됨 칩을 눌러도 서버를 다시 부르지 않고 표시만 줄인다', async () => {
  const { user, api } = setupStaff()
  await screen.findByText('이민호')
  const before = api.calls('GET /staff').length
  await user.click(chip('중지됨 1'))
  expect(rowNames()).toEqual(['서하늘'])
  expect(api.calls('GET /staff')).toHaveLength(before)
})

test('[STAFF-LIST-06] 0명이면 빈 표 대신 초대 폼으로 잇는다', async () => {
  const { user } = setupStaff({ staff: [] })
  expect(await screen.findByText('등록된 직원이 없습니다')).toBeVisible()
  await user.click(within(leftColumn()).getByRole('button', { name: '직원 초대' }))
  expect(within(rightColumn()).getByLabelText('이메일')).toHaveFocus()
})

test('[STAFF-LIST-07] 마지막 로그인은 절대 시각이고 오늘이면 「오늘」을 앞에 세운다', async () => {
  setupStaff()
  await screen.findByText('이민호')
  expect(rowOf('이민호')).toHaveTextContent('마지막 로그인 오늘 08:57')
})

test('[STAFF-LIST-07] 날짜가 넘어가면 「어제」를 앞에 세운다', async () => {
  setupStaff()
  await screen.findByText('최운영')
  expect(rowOf('최운영')).toHaveTextContent('마지막 로그인 어제 17:26')
})

test('[STAFF-LIST-08] 한 번도 안 들어온 직원에게 초대 딱지가 붙는다', async () => {
  setupStaff()
  await screen.findByText('김의사')
  expect(rowOf('김의사')).toHaveTextContent('초대함 · 아직 안 들어옴')
})

test('[STAFF-LIST-08] 초대 딱지에 초대 보낸 날짜가 함께 나온다', async () => {
  setupStaff()
  await screen.findByText('김의사')
  expect(rowOf('김의사')).toHaveTextContent('8월 14일 초대 보냄')
})

test('[STAFF-LIST-08] 이미 들어온 직원에게는 초대 딱지가 붙지 않는다', async () => {
  setupStaff()
  await screen.findByText('이민호')
  expect(rowOf('이민호')).not.toHaveTextContent('초대함')
})

test('[STAFF-ROW-02] 내 행에는 [중지] 버튼이 없다', async () => {
  setupStaff()
  await screen.findByText('김관리(나)')
  expect(within(rowOf('김관리(나)')).queryByRole('button', { name: '중지' })).toBeNull()
})

test('[STAFF-ROW-01] 타인 활성 행에는 [중지] 버튼이 있다', async () => {
  setupStaff()
  await screen.findByText('박접수')
  expect(within(rowOf('박접수')).getByRole('button', { name: '중지' })).toBeVisible()
})

test('[STAFF-ROW-01] 재초대는 resend-invite 엔드포인트를 부른다', async () => {
  const { user, api } = setupStaff()
  await screen.findByText('김의사')
  await user.click(within(rowOf('김의사')).getByRole('button', { name: '재초대' }))
  await waitFor(() => expect(api.lastCall()).toBe('POST /staff/s-006/resend-invite'))
})

test('[STAFF-ROW-01] 재초대 뒤에도 계정이 살아났다고 말하지 않고 초대 딱지가 남는다', async () => {
  const { user } = setupStaff()
  await screen.findByText('김의사')
  await user.click(within(rowOf('김의사')).getByRole('button', { name: '재초대' }))
  expect(await within(rowOf('김의사')).findByText('초대 이메일을 다시 보냈습니다')).toBeVisible()
  expect(rowOf('김의사')).toHaveTextContent('초대함 · 아직 안 들어옴')
})

test('[STAFF-ROW-03] 재초대가 실패하면 그 행에 이유를 보여준다(막다른 침묵 금지)', async () => {
  const { user, api } = setupStaff()
  api.fail('POST /staff/s-006/resend-invite')
  await screen.findByText('김의사')
  await user.click(within(rowOf('김의사')).getByRole('button', { name: '재초대' }))
  // 실패했는데 "다시 보냈습니다"가 뜨면 거짓말 — 서버가 준 이유를 그 행 alert로 보여준다.
  expect(await within(rowOf('김의사')).findByRole('alert')).toHaveTextContent('발송이 잠시 제한')
  expect(within(rowOf('김의사')).queryByText('초대 이메일을 다시 보냈습니다')).toBeNull()
})

test('[STAFF-DELETE-01][STAFF-RESET-PW-01] 삭제는 미수락에만, 비밀번호 재설정은 활성 수락 직원에만 뜬다', async () => {
  setupStaff()
  await screen.findByText('김의사')
  // 미수락(김의사): [삭제] O, [비밀번호 재설정] X
  expect(within(rowOf('김의사')).getByRole('button', { name: '삭제' })).toBeVisible()
  expect(within(rowOf('김의사')).queryByRole('button', { name: '비밀번호 재설정' })).toBeNull()
  // 활성 수락(박접수): [비밀번호 재설정] O, [삭제] X
  expect(within(rowOf('박접수')).getByRole('button', { name: '비밀번호 재설정' })).toBeVisible()
  expect(within(rowOf('박접수')).queryByRole('button', { name: '삭제' })).toBeNull()
})

test('[STAFF-DELETE-01] 미수락 [삭제]는 확인창을 거쳐 DELETE를 부르고 목록에서 사라진다', async () => {
  const { user, api } = setupStaff()
  await screen.findByText('김의사')
  await user.click(within(rowOf('김의사')).getByRole('button', { name: '삭제' }))
  // 되돌릴 수 없는 동작이라 확인창 안에서만 실제 삭제(빨간 버튼도 여기서만).
  await user.click(screen.getByRole('button', { name: '초대 취소하고 삭제' }))
  await waitFor(() => expect(api.calls('DELETE /staff/s-006')).toHaveLength(1))
  await waitFor(() => expect(screen.queryByText('김의사')).toBeNull())
})

test('[STAFF-DELETE-01] 딸린 데이터로 삭제가 막히면 이유를 보이고 행은 남는다(막다른 길 금지)', async () => {
  const { user, api } = setupStaff()
  api.fail('DELETE /staff/s-006')
  await screen.findByText('김의사')
  await user.click(within(rowOf('김의사')).getByRole('button', { name: '삭제' }))
  await user.click(screen.getByRole('button', { name: '초대 취소하고 삭제' }))
  // 서버가 준 이유("중지를 사용하세요")를 확인창에 보이고, 행은 그대로 남는다.
  expect(await screen.findByRole('alert')).toHaveTextContent('중지')
  expect(screen.getByText('김의사')).toBeVisible()
})

test('[STAFF-RESET-PW-01] 비밀번호 재설정은 reset-password 엔드포인트를 부르고 보냈다고 알린다', async () => {
  const { user, api } = setupStaff()
  await screen.findByText('박접수')
  await user.click(within(rowOf('박접수')).getByRole('button', { name: '비밀번호 재설정' }))
  await waitFor(() => expect(api.lastCall()).toBe('POST /staff/s-003/reset-password'))
  expect(await within(rowOf('박접수')).findByText('비밀번호 재설정 메일을 보냈습니다')).toBeVisible()
})

test('[STAFF-STATE-01] 목록이 다시 조회에 실패해도 초대 입력은 지워지지 않는다', async () => {
  const { user, api, refetchList } = setupStaff()
  await screen.findByText('이민호')
  await user.type(within(rightColumn()).getByLabelText('이름'), '새직원')
  api.fail('GET /staff')
  await refetchList()
  // 목록만 다시 조회 실패 → 왼쪽에 [다시 시도], 오른쪽 초대 입력은 보존.
  await waitFor(() => expect(within(leftColumn()).getByRole('button', { name: '다시 시도' })).toBeVisible())
  expect(within(rightColumn()).getByLabelText('이름')).toHaveValue('새직원')
})
