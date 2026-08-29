import { screen, within } from '@testing-library/react'
import { test, expect } from 'vitest'
import {
  renderMerge,
  twoRowGroup,
  groupCard,
  candidateRows,
  dangerButtons,
  routerPath,
} from './testUtils'

// [MERGE-SHELL-* · HEAD-* · LIST-*] 셸·권한·고지·후보 목록. 목록 본문엔 파괴 버튼이 없다.

test('[MERGE-SHELL-01][MERGE-SHELL-03] 관리자는 들어오고, 진입 자체는 열람 기록이 아니다', async () => {
  const { api } = renderMerge({ role: 'admin' })
  // 제목은 셸 헤더가 그린다(STAFF-SHELL-02 개정) — 로드 확인은 본문 설명으로.
  expect(await screen.findByText('같은 사람의 환자 기록이 나뉘었는지 확인하고 병합을 검토합니다')).toBeVisible()
  // 후보를 「보는」 화면이지 특정 환자를 연 것이 아니다 — 진입마다 감사를 남기지 않는다.
  expect(api.calls(/POST/)).toHaveLength(0)
})

test('[MERGE-SHELL-02] 접수직원은 후보 한 줄도 못 보고 갈 길만 받는다', async () => {
  renderMerge({ role: 'receptionist' })
  expect(await screen.findByText('이 화면을 볼 권한이 없습니다')).toBeVisible()
  expect(screen.getByRole('button', { name: /오늘의 현황으로/ })).toBeVisible()
  expect(screen.queryByText('중복 환자 후보')).toBeNull() // 식별자·제목도 안 그린다
  expect(routerPath()).not.toBe('/login') // 로그인은 되어 있다 — 로그인으로 쫓지 않는다
})

test('[MERGE-HEAD-01] 설명을 그리고, 제목은 셸 헤더에 둔다', async () => {
  renderMerge()
  // 서술형 제목 「중복 환자 후보」는 셸 헤더가 그린다(STAFF-SHELL-02 개정) — 본문엔 두지 않는다.
  expect(await screen.findByText('같은 사람의 환자 기록이 나뉘었는지 확인하고 병합을 검토합니다')).toBeVisible()
  expect(screen.queryByRole('heading', { name: '중복 환자 후보' })).toBeNull()
  expect(screen.queryByText(/가족 연결|환자 삭제/)).toBeNull()
})

test('[MERGE-HEAD-02] 「자동으로 합치지 않습니다」와 가족 공유 주의를 같은 자리에서 말한다', async () => {
  renderMerge({ groups: [] })
  expect(await screen.findByText('자동으로 합치지 않습니다')).toBeVisible()
  expect(screen.getByText(/가족이 번호를 공유하면 실제로 다른 사람일 수 있습니다/)).toBeVisible()
})

test('[MERGE-LIST-01] 그룹 안 행이 모두 보이고 미리 대표를 확정하지 않는다', async () => {
  renderMerge({ groups: [twoRowGroup()] })
  const card = await screen.findByLabelText('후보 그룹 01')
  expect(candidateRows(card)).toHaveLength(2)
  expect(within(card).queryByText('대표 환자')).toBeNull()
})

test('[MERGE-LIST-02] 서버가 준 행 순서를 그대로 그린다', async () => {
  renderMerge({ groups: [twoRowGroup()] })
  await screen.findByLabelText('후보 그룹 01')
  const ids = candidateRows(groupCard(0)).map((r) => r.getAttribute('data-row-id'))
  expect(ids).toEqual(['p-a', 'p-b'])
})

test('[MERGE-LIST-03] 목록에 원본 전화·생일·UUID가 없다', async () => {
  renderMerge({ groups: [twoRowGroup()] })
  await screen.findByLabelText('후보 그룹 01')
  expect(screen.getAllByText('1990-**-14').length).toBeGreaterThan(0)
  expect(screen.getAllByText('010-****-7251').length).toBeGreaterThan(0)
  expect(document.body.innerHTML).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/) // UUID 없음
  expect(window.location.search).toBe('') // 검색어를 URL에 안 넣는다
})

test('[MERGE-LIST-04] 카드마다 「다른 사람일 수 있다」를 적고 동일인이라 단정하지 않는다', async () => {
  renderMerge({ groups: [twoRowGroup()] })
  const card = await screen.findByLabelText('후보 그룹 01')
  expect(within(card).getByText(/가족이 번호를 공유하면 실제로 다른 사람일 수 있습니다/)).toBeVisible()
  expect(within(card).queryByText(/확실히|동일인/)).toBeNull()
})

test('[MERGE-LIST-05] 목록엔 회색 [대표 검토]뿐 — 빨간 버튼도 [삭제]도 없다', async () => {
  renderMerge({ groups: [twoRowGroup()] })
  const card = await screen.findByLabelText('후보 그룹 01')
  expect(within(card).getAllByRole('button', { name: '대표 검토' })).toHaveLength(2)
  expect(within(card).queryByRole('button', { name: /삭제/ })).toBeNull()
  expect(dangerButtons()).toHaveLength(0) // 빨강은 확인창 안에서만
})

test('[MERGE-LIST-06] 후보 0건은 조회 실패가 아니라 사실이라 [다시 시도]를 안 둔다', async () => {
  renderMerge({ groups: [] })
  expect(await screen.findByText('현재 병합을 검토할 중복 환자가 없습니다')).toBeVisible()
  expect(screen.getByText('새 후보가 생기면 이곳에 표시됩니다')).toBeVisible()
  expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
})
