import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { SelectableList, type GroupAction } from './SelectableList'

// ⭐ 여러 명 고르기는 전역 규칙이다(`PICK-*`). 같은 부품이 목록 화면 셋에 붙는다(/queue·/today·/patients).
//    화면마다 따로 만들면 「여기선 되고 저기선 안 되는」 상태가 된다.

interface Row { id: string; name: string; status: string }

function makeRows(n: number, status = '아직 안 옴'): Row[] {
  return Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `환자${i}`, status }))
}

const defaultResolver = (statuses: string[]): GroupAction | null => {
  if (statuses.length !== 1) return { kind: 'mixed', message: '상태가 섞여 있어 「도착 처리」는 할 수 없습니다' }
  if (statuses[0] === '아직 안 옴') return { kind: 'action', label: '도착 처리', onRun: vi.fn() }
  if (statuses[0] === '도착') return { kind: 'action', label: '진료 대기로', onRun: vi.fn() }
  return null
}

function renderList(rows: Row[], opts: Partial<{ matchTotal: number; filterKey: string; onSend: (mode: { allMatching: boolean }) => void }> = {}) {
  return render(
    <SelectableList
      rows={rows}
      getId={(r) => r.id}
      getRowLabel={(r) => r.name}
      getStatus={(r) => r.status}
      renderRow={(r) => <span>{r.name}</span>}
      renderRowActions={() => <button type="button">도착 처리</button>}
      groupActionFor={defaultResolver}
      matchTotal={opts.matchTotal}
      filterKey={opts.filterKey}
      onSend={opts.onSend ?? vi.fn()}
      onDownload={vi.fn()}
    />,
  )
}

async function enterPick(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '선택' }))
}
async function pickByName(user: ReturnType<typeof userEvent.setup>, names: string[]) {
  for (const n of names) await user.click(screen.getByLabelText(`${n} 선택`))
}

test('[PICK-BTN-01][PICK-BTN-02] 평소에는 체크칸이 없고, [선택]을 눌러야 돋아난다', async () => {
  const user = userEvent.setup()
  renderList(makeRows(3))
  expect(screen.queryByRole('checkbox')).toBeNull()
  await enterPick(user)
  expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0)
})

test('[PICK-BTN-03] 버튼 이름은 [선택]이지 [안내 보내기]가 아니다', () => {
  renderList(makeRows(2))
  expect(screen.getByRole('button', { name: '선택' })).toBeVisible()
})

test('[PICK-ACT-01][PICK-ACT-01b] 막대에는 늘 [✉ 안내 보내기]·[⬇ 내려받기]·[취소]가 있고 선택 수를 센다', async () => {
  const user = userEvent.setup()
  renderList(makeRows(3))
  await enterPick(user)
  await pickByName(user, ['환자0', '환자1'])
  expect(screen.getByText('2명 선택됨')).toBeVisible()
  expect(screen.getByRole('button', { name: '✉ 안내 보내기' })).toBeVisible()
  expect(screen.getByRole('button', { name: '⬇ 내려받기' })).toBeVisible()
  expect(screen.getByRole('button', { name: '취소' })).toBeVisible()
})

test('[PICK-ACT-01c] 고른 사람이 전부 같은 상태면 그 상태의 동작이 하나 더 붙는다', async () => {
  const user = userEvent.setup()
  renderList([
    { id: 'a', name: '김순자', status: '도착' },
    { id: 'b', name: '박민수', status: '도착' },
  ])
  await enterPick(user)
  await pickByName(user, ['김순자', '박민수'])
  expect(screen.getByRole('button', { name: '진료 대기로' })).toBeVisible()
})

test('[PICK-MIX-01][PICK-MIX-03] 상태가 섞이면 상태 버튼을 숨기되 왜 없는지 적는다', async () => {
  const user = userEvent.setup()
  renderList([
    { id: 'a', name: '김순자', status: '도착' },
    { id: 'b', name: '박민수', status: '아직 안 옴' },
  ])
  await enterPick(user)
  await pickByName(user, ['김순자', '박민수'])
  expect(screen.queryByRole('button', { name: '진료 대기로' })).toBeNull()
  expect(screen.getByText('상태가 섞여 있어 「도착 처리」는 할 수 없습니다')).toBeVisible()
})

test('[PICK-ACT-02] 선택 모드에서는 줄 버튼이 사라진다', async () => {
  const user = userEvent.setup()
  renderList(makeRows(3))
  expect(screen.getAllByRole('button', { name: '도착 처리' }).length).toBeGreaterThan(0)
  await enterPick(user)
  expect(screen.queryAllByRole('button', { name: '도착 처리' })).toHaveLength(0)
})

test('[PICK-ACT-03] 0명이면 「보낼 사람을 고르세요」로 동작이 꺼진다', async () => {
  const user = userEvent.setup()
  renderList(makeRows(3))
  await enterPick(user)
  expect(screen.getByText('보낼 사람을 고르세요')).toBeVisible()
  expect(screen.getByRole('button', { name: '✉ 안내 보내기' })).toBeDisabled()
})

test('[PICK-ALL-01][PICK-ALL-02][PICK-ALL-03] 머리 체크칸은 「보이는 것 전부」, 검색 결과 전체는 따로 묻는다', async () => {
  const user = userEvent.setup()
  renderList(makeRows(20), { matchTotal: 120 })
  await enterPick(user)
  await user.click(screen.getByLabelText('보이는 항목 전체 선택'))
  expect(screen.getByText('20명 선택됨')).toBeVisible() // 「보이는 것만」이 먼저다
  expect(screen.getByText(/이 검색 결과에는 120명이 있습니다/)).toBeVisible()
  await user.click(screen.getByRole('button', { name: '검색 결과 120명 전부 선택' }))
  expect(screen.getByText('120명 선택됨')).toBeVisible() // 두 뜻이 갈려 있다
})

test('[PICK-ALL-04] 전체를 켜면 경고 띠가 되고, 되돌리는 길이 같은 자리에 있다', async () => {
  const user = userEvent.setup()
  renderList(makeRows(20), { matchTotal: 120 })
  await enterPick(user)
  await user.click(screen.getByLabelText('보이는 항목 전체 선택'))
  await user.click(screen.getByRole('button', { name: '검색 결과 120명 전부 선택' }))
  expect(screen.getByText('화면에 보이지 않는 100명이 포함됩니다')).toBeVisible()
  expect(screen.getByRole('button', { name: '보이는 20명만 선택' })).toBeVisible()
})

test('[PICK-ONE-01][PICK-ONE-02] 120명에서 한 명을 빼면 119명이 되고 전체 선택이 통째로 풀리지 않는다', async () => {
  const user = userEvent.setup()
  renderList(makeRows(20), { matchTotal: 120 })
  await enterPick(user)
  await user.click(screen.getByLabelText('보이는 항목 전체 선택'))
  await user.click(screen.getByRole('button', { name: '검색 결과 120명 전부 선택' }))
  await user.click(screen.getByLabelText('환자0 선택')) // 한 명을 뺀다
  expect(screen.getByText('119명 선택됨')).toBeVisible()
  expect(screen.getByLabelText('보이는 항목 전체 선택')).toBePartiallyChecked()
})

test('[PICK-DROP-01] 검색어·필터를 바꾸면 선택이 풀리고 그 사실을 알린다', async () => {
  const user = userEvent.setup()
  const { rerender } = renderList(makeRows(3), { filterKey: '김' })
  await enterPick(user)
  await pickByName(user, ['환자0', '환자1'])
  expect(screen.getByText('2명 선택됨')).toBeVisible()
  // 목록이 달라졌는데 「2명」이 남아 있으면 그 숫자가 무엇인지 아무도 모른다.
  rerender(
    <SelectableList
      rows={makeRows(3)}
      getId={(r) => r.id}
      getRowLabel={(r) => r.name}
      getStatus={(r) => r.status}
      renderRow={(r) => <span>{r.name}</span>}
      renderRowActions={() => <button type="button">도착 처리</button>}
      groupActionFor={defaultResolver}
      filterKey="박"
      onSend={vi.fn()}
      onDownload={vi.fn()}
    />,
  )
  expect(screen.getByRole('status')).toHaveTextContent('대상이 바뀌어 선택을 지웠습니다')
})

test('[PICK-DROP-02] [취소]를 누르면 체크칸이 사라지고 줄 버튼이 돌아온다', async () => {
  const user = userEvent.setup()
  renderList(makeRows(3))
  await enterPick(user)
  expect(screen.queryAllByRole('button', { name: '도착 처리' })).toHaveLength(0)
  await user.click(screen.getByRole('button', { name: '취소' }))
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  expect(screen.getAllByRole('button', { name: '도착 처리' }).length).toBeGreaterThan(0)
})
