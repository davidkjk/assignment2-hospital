import { screen, waitFor, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { openProfile, rightColumn, rowOf, setupStaff } from './testUtils'

// [CAL-COLOR-*·STAFF-PROFILE-11] 캘린더 색 고르개 — 프로필 패널 안.

function swatches(): HTMLElement[] {
  return Array.from(rightColumn().querySelectorAll('[data-swatch]')) as HTMLElement[]
}
function swatch(index: number): HTMLElement {
  return rightColumn().querySelector(`[data-swatch="${index}"]`) as HTMLElement
}
function paletteNote(): HTMLElement {
  return rightColumn().querySelector('[data-palette-note]') as HTMLElement
}
function paletteWarning(): HTMLElement {
  return rightColumn().querySelector('[data-palette-warning]') as HTMLElement
}

test('[CAL-COLOR-01] 팔레트에는 10개의 고를 색이 있다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await openProfile(user, '이민호')
  expect(swatches()).toHaveLength(10)
})

test('[CAL-COLOR-02] 색을 직접 만드는 입력(색상 선택·스포이드)이 없다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await openProfile(user, '이민호')
  expect(within(rightColumn()).queryByLabelText(/#RRGGBB|색상 선택|스포이드/)).toBeNull()
})

test('[CAL-COLOR-12] 칩은 캘린더에서 보일 그 모습이다 — 면 색 배경', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await openProfile(user, '이민호')
  expect(swatch(3)).toHaveStyle({ background: 'var(--doctor-palette-3-fill)' })
})

test('[CAL-COLOR-12] 칩 글자는 그 번호의 진한 색이다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await openProfile(user, '이민호')
  expect(swatch(3)).toHaveStyle({ color: 'var(--doctor-palette-3)' })
})

test('[CAL-COLOR-06] 팔레트 자리에 「모든 직원의 화면에서 함께 바뀐다」고 알린다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await openProfile(user, '이민호')
  expect(paletteNote()).toHaveTextContent('이 색은 모든 직원의 화면에서 함께 바뀝니다')
})

test('[STAFF-PROFILE-11] 색 고르는 자리는 프로필 패널 안의 「캘린더 색」 그룹이고 라디오 10개다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await openProfile(user, '이민호')
  const panel = screen.getByRole('complementary', { name: '의사 프로필' })
  const group = within(panel).getByRole('group', { name: '캘린더 색' })
  expect(within(group).getAllByRole('radio')).toHaveLength(10)
})

test('[STAFF-PROFILE-11] 색만 여는 별도 팝오버(색 바꾸기)를 만들지 않는다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await openProfile(user, '이민호')
  expect(screen.queryByRole('dialog', { name: '색 바꾸기' })).toBeNull()
})

test('[CAL-COLOR-07] 다른 의사가 쓰는 색은 「사용중」이라 적되 고르는 것을 막지 않는다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await openProfile(user, '이민호')
  expect(swatch(1)).toHaveTextContent('사용중')
  expect(swatch(1)).toBeEnabled()
})

test('[CAL-COLOR-07] 같은 진료과에서 겹치는 색을 고르면 그 자리에서 알린다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await openProfile(user, '이민호')
  await user.click(swatch(1))
  expect(paletteWarning()).toHaveTextContent('같은 진료과에서 겹치면 읽기 어려워집니다')
})

test('[CAL-COLOR-08] 비의사 줄에는 색 칸(및 「해당 없음」)을 아예 그리지 않는다', async () => {
  setupStaff()
  await screen.findByText('박접수')
  // L50(2026-08-29): 맥락 없는 「해당 없음」이 혼란스러워 색 칸 자체를 생략한다.
  expect(rowOf('박접수')).not.toHaveTextContent('해당 없음')
})

test('[CAL-COLOR-09] 저장하는 것은 색값이 아니라 팔레트 번호다', async () => {
  const { user, api } = setupStaff()
  await screen.findByText('이민호')
  await openProfile(user, '이민호')
  await user.click(swatch(6))
  await user.click(within(rightColumn()).getByRole('button', { name: '저장' }))
  await waitFor(() => expect(api.calls('PATCH /staff/s-002/profile')).toHaveLength(1))
  expect(api.calls('PATCH /staff/s-002/profile')[0].body).toEqual({ calendar_color_index: 6 })
})

test('[CAL-COLOR-09] 저장 본문에 색값(#RRGGBB)이 들어가지 않는다', async () => {
  const { user, api } = setupStaff()
  await screen.findByText('이민호')
  await openProfile(user, '이민호')
  await user.click(swatch(6))
  await user.click(within(rightColumn()).getByRole('button', { name: '저장' }))
  await waitFor(() => expect(api.calls('PATCH /staff/s-002/profile')).toHaveLength(1))
  expect(JSON.stringify(api.lastBody())).not.toMatch(/#[0-9A-Fa-f]{6}/)
})
