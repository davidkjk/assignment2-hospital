import { screen, within } from '@testing-library/react'
import { test, expect } from 'vitest'
import {
  renderMerge,
  twoRowGroup,
  enterCompare,
  pickPrimary,
  compare,
  leftCard,
  rightCard,
  itemLabels,
  badges,
} from './testUtils'

// [MERGE-COMPARE-* · MERGE-REVIEW-* · MERGE-STATE-04] 두 후보를 나란히 비교하고 대표를 고른다.

const COMPARE_ITEMS = ['계정 연결', '예약', '문진 작성 예약', '진료기록', '감사 기록', '마지막 방문']

test('[MERGE-COMPARE-01][MERGE-COMPARE-02] 좌·우 카드에 같은 항목 묶음이 같은 순서로 있다', async () => {
  const { user } = renderMerge({ groups: [twoRowGroup()] })
  await screen.findByLabelText('후보 그룹 01')
  await enterCompare(user)
  expect(itemLabels(leftCard())).toEqual(COMPARE_ITEMS)
  expect(itemLabels(rightCard())).toEqual(COMPARE_ITEMS)
  expect(within(compare()).getAllByText('0건').length).toBeGreaterThan(0) // 없는 값도 빈칸이 아니라 0건
})

test('[MERGE-COMPARE-03] 많은 쪽을 권하되 자동으로 대표를 고르지 않는다', async () => {
  const { user } = renderMerge({ groups: [twoRowGroup()] })
  await screen.findByLabelText('후보 그룹 01')
  await enterCompare(user)
  expect(screen.getByText(/기록이 더 많은 쪽을 대표로 권합니다/)).toBeVisible()
  expect(screen.getByText(/앱·이력에서 보이는 범위가 달라질 수 있습니다/)).toBeVisible()
  expect(badges(leftCard())).not.toContain('대표 환자')
  expect(badges(rightCard())).not.toContain('대표 환자')
})

test('[MERGE-COMPARE-04][MERGE-STATE-04] 양쪽 다 계정이면 검토 버튼이 잠기고 이유를 말한다', async () => {
  const { user } = renderMerge({ groups: [twoRowGroup({ bothLinked: true })] })
  await screen.findByLabelText('후보 그룹 01')
  await enterCompare(user)
  expect(screen.getByText(/두 기록 모두 계정이 연결되어 있어 자동 병합할 수 없습니다/)).toBeVisible()
  expect(screen.getByText(/가족 연결과 혼동하지 말고/)).toBeVisible()
  expect(screen.getByRole('button', { name: '병합 내용 검토' })).toBeDisabled()
  // 플랜 S17 ④ 막다른 길 방지 — 각 기록을 새 탭 환자 상세로 열어 병합 화면을 떠나지 않고 확인.
  const lockLinks = screen.getAllByRole('link', { name: /환자 상세$/ })
  expect(lockLinks).toHaveLength(2)
  expect(lockLinks[0]).toHaveAttribute('href', '/patients/p-a')
  expect(lockLinks[1]).toHaveAttribute('href', '/patients/p-b')
  lockLinks.forEach((a) => expect(a).toHaveAttribute('target', '_blank'))
})

test('[MERGE-COMPARE-05] 원문을 여기서 안 펼치고 환자 상세로 보낸다', async () => {
  const { user } = renderMerge({ groups: [twoRowGroup()] })
  await screen.findByLabelText('후보 그룹 01')
  await enterCompare(user)
  expect(screen.queryByRole('button', { name: /번호 보기|원문/ })).toBeNull()
  expect(screen.getByRole('link', { name: /환자 상세에서 확인/ })).toBeVisible()
})

test('[MERGE-COMPARE-06] 원본이 어디 남는지를 비교 화면에서 말한다', async () => {
  const { user } = renderMerge({ groups: [twoRowGroup()] })
  await screen.findByLabelText('후보 그룹 01')
  await enterCompare(user)
  expect(
    screen.getByText(/원본 예약·문진·진료기록·열람 기록은 원래 자리에 남고, 대표 조회가 계보를 따라 함께 읽습니다/),
  ).toBeVisible()
})

test('[MERGE-REVIEW-01] 대표를 고르면 배지만 바뀌고 서버는 안 부른다', async () => {
  const { user, api } = renderMerge({ groups: [twoRowGroup()] })
  await screen.findByLabelText('후보 그룹 01')
  await enterCompare(user)
  await pickPrimary(user, '좌')
  expect(within(leftCard()).getByText('대표 환자')).toBeVisible()
  expect(within(rightCard()).getByText('병합되어 비활성화될 후보')).toBeVisible()
  expect(api.writeCalls()).toHaveLength(0) // 아직 아무것도 안 바뀌었다
})

test('[MERGE-REVIEW-02] [병합 내용 검토]는 대표를 고른 뒤에야 열리고, 바로 확정하지 않는다', async () => {
  const { user, api } = renderMerge({ groups: [twoRowGroup()] })
  await screen.findByLabelText('후보 그룹 01')
  await enterCompare(user)
  expect(screen.getByRole('button', { name: '병합 내용 검토' })).toBeDisabled() // 대표 전엔 잠김
  await pickPrimary(user, '좌')
  const btn = screen.getByRole('button', { name: '병합 내용 검토' })
  expect(btn).toBeEnabled()
  expect(btn).toHaveClass('btn-outline')
  await user.click(btn)
  expect(api.writeCalls()).toHaveLength(0) // 확인창을 여는 단계일 뿐이다
  expect(screen.getByRole('dialog')).toBeVisible()
})
