import { screen, waitFor, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { rightColumn, rowOf, setupStaff } from './testUtils'

// [STAFF-INVITE-*] 초대 폼. 오른쪽 칸에 붙박이로 있다.

function roleOptions(): string[] {
  const group = within(rightColumn()).getByRole('group', { name: '역할' })
  return within(group)
    .getAllByRole('button')
    .map((b) => b.textContent ?? '')
    .filter(Boolean)
}

async function inviteDoctor(user: UserEvent, name = '정다은'): Promise<void> {
  await user.type(within(rightColumn()).getByLabelText('이메일'), 'new-doctor@lunahospital.test')
  await user.type(within(rightColumn()).getByLabelText('이름'), name)
  await user.click(within(rightColumn()).getByRole('button', { name: '의사' }))
  await user.selectOptions(within(rightColumn()).getByLabelText('소속 진료과'), '내과')
  await user.click(within(rightColumn()).getByRole('button', { name: '초대' }))
}

test('[STAFF-INVITE-01] 비밀번호 칸이 없다', async () => {
  setupStaff()
  await screen.findByText('이민호')
  expect(within(rightColumn()).queryByLabelText(/비밀번호/)).toBeNull()
})

test('[STAFF-INVITE-02] 역할은 접수직원·의사·관리자 셋뿐이다', async () => {
  setupStaff()
  await screen.findByText('이민호')
  expect(roleOptions()).toEqual(['접수직원', '의사', '관리자'])
})

test('[STAFF-INVITE-03] 의사를 고르면 진료과 미선택은 서버에 보내기 전에 막힌다', async () => {
  const { user, api } = setupStaff()
  await screen.findByText('이민호')
  await user.type(within(rightColumn()).getByLabelText('이메일'), 'd@lunahospital.test')
  await user.type(within(rightColumn()).getByLabelText('이름'), '무소속')
  await user.click(within(rightColumn()).getByRole('button', { name: '의사' }))
  await user.click(within(rightColumn()).getByRole('button', { name: '초대' }))
  expect(within(rightColumn()).getByText('의사는 소속 진료과를 선택해야 합니다.')).toBeVisible()
  expect(api.calls('POST /staff')).toHaveLength(0)
})

test('[STAFF-INVITE-03] 진료과 선택지는 사용 중인 진료과만이다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await user.click(within(rightColumn()).getByRole('button', { name: '의사' }))
  const select = within(rightColumn()).getByLabelText('소속 진료과') as HTMLSelectElement
  const names = Array.from(select.options).map((o) => o.textContent)
  expect(names).toContain('내과')
  expect(names).not.toContain('폐과된과')
})

test('[STAFF-INVITE-04] 성공하면 폼을 비운다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await inviteDoctor(user)
  expect(await screen.findByText('초대했습니다')).toBeVisible()
  expect(within(rightColumn()).getByLabelText('이메일')).toHaveValue('')
})

test('[STAFF-INVITE-04] 성공하면 새 직원이 초대 딱지를 달고 목록에 나타난다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await inviteDoctor(user, '정다은')
  await waitFor(() => expect(rowOf('정다은')).toHaveTextContent('초대함 · 아직 안 들어옴'))
})

test('[STAFF-INVITE-05] 실패하면 입력한 이메일을 남긴다', async () => {
  const { user, api } = setupStaff()
  await screen.findByText('이민호')
  api.fail('POST /staff')
  await inviteDoctor(user)
  expect(within(rightColumn()).getByLabelText('이메일')).toHaveValue('new-doctor@lunahospital.test')
})

test('[STAFF-INVITE-05] 실패하면 버튼 가까이 이유와 [다시 시도]를 둔다', async () => {
  const { user, api } = setupStaff()
  await screen.findByText('이민호')
  api.fail('POST /staff')
  await inviteDoctor(user)
  expect(await within(rightColumn()).findByText('초대에 실패했습니다')).toBeVisible()
  expect(within(rightColumn()).getByRole('button', { name: '다시 시도' })).toBeVisible()
})
