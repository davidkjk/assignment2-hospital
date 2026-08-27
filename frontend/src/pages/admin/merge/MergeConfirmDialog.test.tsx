import { screen, within } from '@testing-library/react'
import { test, expect } from 'vitest'
import {
  renderMerge,
  twoRowGroup,
  enterCompare,
  pickPrimary,
  openConfirm,
  ackAndConfirm,
  dialogItemLabels,
  dangerButtons,
  leftCard,
} from './testUtils'

// [MERGE-CONFIRM-* · MERGE-DATA-04 · MERGE-AUDIT-01 · MERGE-UNDO-* · MERGE-RACE-01 · MERGE-STATE-01~03]
// 3단계의 마지막. 비가역·파괴적이라 읽음 체크 뒤에만, 확인창 안에서만 빨간 버튼이 열린다.

test('[MERGE-CONFIRM-01] 확인창은 병합 고유 항목을 목록으로 보여주고 뒤 배경을 막는다', async () => {
  const { user } = renderMerge({ groups: [twoRowGroup()] })
  await screen.findByLabelText('후보 그룹 01')
  await openConfirm(user)
  expect(dialogItemLabels()).toEqual(['대표 환자', '병합될 후보', '계정 연결', '데이터 소유권', '정정 절차'])
  expect(screen.getByTestId('dialog-scrim')).toBeInTheDocument() // BLOCK-CONF-01 — 뒤덮개가 클릭을 삼킨다
})

test('[MERGE-CONFIRM-02] 빨간 버튼은 확인창 안에 하나뿐이다', async () => {
  const { user } = renderMerge({ groups: [twoRowGroup()] })
  await screen.findByLabelText('후보 그룹 01')
  await openConfirm(user)
  const dialog = screen.getByRole('dialog')
  expect(dangerButtons(dialog)).toHaveLength(1)
  expect(dangerButtons()).toHaveLength(1) // 문서 전체에도 딱 하나 — 그 하나가 확인창 안에 있다
})

test('[MERGE-CONFIRM-03] 비가역 고지와 「갈 길」을 함께 말한다(막다른 길 방지)', async () => {
  const { user } = renderMerge({ groups: [twoRowGroup()] })
  await screen.findByLabelText('후보 그룹 01')
  await openConfirm(user)
  expect(screen.getByText('병합 확정 후 이 화면에서 취소할 수 없습니다')).toBeVisible()
  expect(screen.getByText(/병합 이력 화면에서 관리자가 되돌릴 수 있습니다/)).toBeVisible()
})

test('[MERGE-CONFIRM-04] 읽음 체크 전엔 확정 버튼이 안 열리고, 체크는 서버로 안 보낸다', async () => {
  const { user, api } = renderMerge({ groups: [twoRowGroup()] })
  await screen.findByLabelText('후보 그룹 01')
  await openConfirm(user)
  expect(screen.getByTestId('danger')).toBeDisabled()
  await user.click(screen.getByRole('checkbox', { name: /읽었습니다/ }))
  expect(screen.getByTestId('danger')).toBeEnabled()
  await user.click(screen.getByTestId('danger'))
  const body = api.lastCall('POST /admin/merge-candidates/merge')?.body as Record<string, unknown>
  expect(body).not.toHaveProperty('acknowledged') // 이해 확인일 뿐 — 동시성 재검사를 대신하지 않는다
  expect(body).toHaveProperty('primary_id')
  expect(body).toHaveProperty('expected_counts')
})

test('[MERGE-CONFIRM-05] [취소]는 아무것도 바꾸지 않고 고른 대표를 남긴 채 비교로 돌아온다', async () => {
  const { user, api } = renderMerge({ groups: [twoRowGroup()] })
  await screen.findByLabelText('후보 그룹 01')
  await openConfirm(user)
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(within(leftCard()).getByText('대표 환자')).toBeVisible()
  expect(api.writeCalls()).toHaveLength(0)
})

test('[MERGE-DATA-04][MERGE-AUDIT-01] 확정 화면이 무엇이 기록되는지 미리 말한다', async () => {
  const { user } = renderMerge({ groups: [twoRowGroup()] })
  await screen.findByLabelText('후보 그룹 01')
  await openConfirm(user)
  expect(screen.getByText(/누가 · 언제 · 무엇을 합쳤는지 열람 기록에 남습니다/)).toBeVisible()
})

test('[MERGE-UNDO-02] 「이 화면에서는 취소할 수 없습니다」를 일관되게 말하고 자동 복구를 약속하지 않는다', async () => {
  const { user } = renderMerge({ groups: [twoRowGroup()] })
  await screen.findByLabelText('후보 그룹 01')
  await openConfirm(user)
  expect(screen.getByText(/이 화면에서는 병합을 취소할 수 없습니다/)).toBeVisible()
  expect(screen.queryByText(/자동으로 복구|원래대로 돌아갑니다/)).toBeNull()
})

test('[MERGE-UNDO-01][MERGE-UNDO-03] 성공 뒤 이력 ID·정정 경로를 주고 되돌리기 버튼은 안 둔다', async () => {
  const { user } = renderMerge({ groups: [twoRowGroup()] })
  await screen.findByLabelText('후보 그룹 01')
  await openConfirm(user)
  await ackAndConfirm(user)
  expect(await screen.findByText(/병합 이력 ID/)).toBeVisible()
  expect(screen.getByText('merge-0001')).toBeVisible()
  expect(screen.getByText(/비활성화된 행/)).toBeVisible()
  expect(screen.getByRole('link', { name: '병합 이력 화면' })).toHaveAttribute('href', '/admin/merge-history')
  expect(screen.queryByRole('button', { name: /되돌리기/ })).toBeNull()
})

test('[MERGE-RACE-01] 409면 실행하지 않고 [다시 확인]으로 최신 후보를 다시 읽는다', async () => {
  const { user, api } = renderMerge({ groups: [twoRowGroup()] })
  await screen.findByLabelText('후보 그룹 01')
  await openConfirm(user)
  api.respond('POST /admin/merge-candidates/merge', 409, '후보 상태가 바뀌었습니다. 목록과 기록 건수를 다시 확인하세요.')
  await ackAndConfirm(user)
  expect(
    await screen.findByText('후보 상태가 바뀌었습니다. 목록과 기록 건수를 다시 확인하세요.'),
  ).toBeVisible()
  await user.click(screen.getByRole('button', { name: '다시 확인' }))
  expect(api.calls('GET /admin/merge-candidates')).toHaveLength(2) // 처음 + 다시 확인
})

test('[MERGE-STATE-01] 재조회 중에는 이전 후보를 새 응답과 섞지 않는다', async () => {
  const { user, api } = renderMerge({ groups: [twoRowGroup()] })
  await screen.findByLabelText('후보 그룹 01')
  api.pauseCandidates()
  await user.click(screen.getByRole('button', { name: '다시 확인' }))
  expect(await screen.findAllByTestId('skeleton')).toHaveLength(2)
  expect(screen.getByText('중복 환자 후보를 불러오는 중입니다')).toBeVisible()
  expect(screen.queryByLabelText('후보 그룹 01')).toBeNull() // 섞이면 옛 건수로 병합한다
})

test('[MERGE-STATE-02] 조회 실패는 비교 상태를 지우지 않는다', async () => {
  const { user, api } = renderMerge({ groups: [twoRowGroup()] })
  await screen.findByLabelText('후보 그룹 01')
  await enterCompare(user)
  await pickPrimary(user, '좌')
  api.respond('GET /admin/merge-candidates', 500)
  await user.click(screen.getByRole('button', { name: '다시 확인' }))
  expect(await screen.findByRole('alert')).toBeVisible()
  expect(within(leftCard()).getByText('대표 환자')).toBeVisible()
})

test('[MERGE-STATE-03] 오프라인에서는 캐시로 병합을 시작하게 두지 않는다', async () => {
  renderMerge({ online: false, groups: [twoRowGroup()] })
  expect(await screen.findByRole('status')).toHaveTextContent(/인터넷이 연결되어 있지 않습니다/)
  expect((await screen.findAllByRole('button', { name: '대표로 검토' }))[0]).toBeDisabled()
})
