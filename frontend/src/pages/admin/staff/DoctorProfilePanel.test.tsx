import { screen, waitFor, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { openProfile, rightColumn, rowOf, setupStaff } from './testUtils'

// [STAFF-PROFILE-*] 의사 프로필 패널 — 오른쪽 칸을 잠시 빌려 쓴다.

function avatar(): HTMLElement {
  return within(rightColumn()).getByTestId('doctor-avatar')
}
function fieldNames(): string[] {
  return (Array.from(rightColumn().querySelectorAll('[data-field]')) as HTMLElement[]).map(
    (el) => el.getAttribute('data-field') ?? '',
  )
}
function field(name: string): HTMLElement {
  return rightColumn().querySelector(`[data-field="${name}"]`) as HTMLElement
}

test('[STAFF-PROFILE-01] 의사 행의 [프로필]을 누르면 오른쪽 칸이 그 의사 편집으로 바뀐다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await openProfile(user, '이민호')
  expect(within(rightColumn()).getByRole('heading')).toHaveTextContent('이민호 선생님 프로필')
})

test('[STAFF-PROFILE-01] 편집 중인 의사 행이 강조된다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await openProfile(user, '이민호')
  expect(rowOf('이민호')).toHaveAttribute('aria-current', 'true')
})

test('[STAFF-PROFILE-01] 프로필을 열면 초대 폼은 접근 트리에서 사라진다(숨김)', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await openProfile(user, '이민호')
  expect(within(rightColumn()).queryByRole('form', { name: '직원 초대' })).toBeNull()
})

test('[STAFF-PROFILE-02] 접수직원 행에는 [프로필] 버튼을 아예 그리지 않는다', async () => {
  setupStaff()
  await screen.findByText('박접수')
  expect(within(rowOf('박접수')).queryByRole('button', { name: '프로필' })).toBeNull()
})

test('[STAFF-PROFILE-03] 편집 중에도 다른 의사로 바로 갈아탈 수 있다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await openProfile(user, '이민호')
  await openProfile(user, '한서윤')
  expect(within(rightColumn()).getByRole('heading')).toHaveTextContent('한서윤 선생님 프로필')
})

test('[STAFF-PROFILE-04] 편집 항목은 사진·전문분야·소개글·캘린더 색 넷이다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await openProfile(user, '이민호')
  expect(fieldNames()).toEqual(['사진', '전문분야', '소개글', '캘린더 색'])
})

test('[STAFF-PROFILE-04] 프로필 패널에서 역할은 고치지 않는다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await openProfile(user, '이민호')
  const panel = screen.getByRole('complementary', { name: '의사 프로필' })
  expect(within(panel).queryByLabelText('역할')).toBeNull()
})

test('[STAFF-PROFILE-05] 사진이 없으면 회색 원에 이름 첫 글자가 나온다', async () => {
  const { user } = setupStaff()
  await screen.findByText('한서윤')
  await openProfile(user, '한서윤')
  expect(avatar()).toHaveTextContent('한')
})

test('[STAFF-PROFILE-05] 사진이 없어도 「사진 없음」 문구를 쓰지 않는다', async () => {
  const { user } = setupStaff()
  await screen.findByText('한서윤')
  await openProfile(user, '한서윤')
  expect(within(rightColumn()).queryByText('사진 없음')).toBeNull()
})

test('[STAFF-PROFILE-06] 받는 형식·용량을 고르기 전에 버튼 옆에 적는다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await openProfile(user, '이민호')
  expect(field('사진')).toHaveTextContent('JPG·PNG · 5MB까지')
})

test('[STAFF-PROFILE-07] 사진 지우기는 확인창 안에서만 서버를 부른다', async () => {
  const { user, api } = setupStaff()
  await screen.findByText('이민호')
  await openProfile(user, '이민호')
  await user.click(within(rightColumn()).getByRole('button', { name: '사진 지우기' }))
  expect(api.calls('DELETE /staff/s-002/photo')).toHaveLength(0)
})

test('[STAFF-PROFILE-07] 확인창에서 지우면 회색 원 + 이름 첫 글자로 돌아간다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await openProfile(user, '이민호')
  await user.click(within(rightColumn()).getByRole('button', { name: '사진 지우기' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '지우기' }))
  await waitFor(() => expect(avatar()).toHaveTextContent('이'))
})

test('[STAFF-PROFILE-08] 전문분야는 환자 앱에 보인다고 그 자리에 적는다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await openProfile(user, '이민호')
  expect(field('전문분야')).toHaveTextContent('환자 앱 의사 선택 화면에 그대로 보입니다')
})

test('[STAFF-PROFILE-08] 소개글은 환자에게 안 보이고 상담봇이 쓴다고 적는다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await openProfile(user, '이민호')
  expect(field('소개글')).toHaveTextContent('환자 화면에는 나오지 않습니다')
  expect(field('소개글')).toHaveTextContent('상담봇이 답할 때 씁니다')
})

test('[STAFF-PROFILE-09] 고친 채 다른 줄로 떠나려 하면 묻는다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await openProfile(user, '이민호')
  await user.type(within(rightColumn()).getByLabelText('전문분야'), '소화기내과')
  await openProfile(user, '한서윤')
  expect(screen.getByRole('dialog')).toHaveTextContent('저장하지 않은 변경이 있습니다')
})

test('[STAFF-PROFILE-09] 떠나기를 취소하면 원래 의사에 남는다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await openProfile(user, '이민호')
  await user.type(within(rightColumn()).getByLabelText('전문분야'), '소화기내과')
  await openProfile(user, '한서윤')
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }))
  expect(within(rightColumn()).getByRole('heading')).toHaveTextContent('이민호')
})

test('[STAFF-PROFILE-10] 닫으면 초대 폼으로 돌아오고 쓰던 초대 내용이 살아 있다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await user.type(within(rightColumn()).getByLabelText('이름'), '새직원')
  await openProfile(user, '이민호')
  await user.click(within(rightColumn()).getByRole('button', { name: '닫기' }))
  expect(within(rightColumn()).getByLabelText('이름')).toHaveValue('새직원')
})
