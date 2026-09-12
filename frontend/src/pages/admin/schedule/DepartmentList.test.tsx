import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { DepartmentList } from './DepartmentList'
import { ApiError } from '../../../api/httpClient'
import type { Department } from './types'

const DEPTS: Department[] = [
  { id: 'dep1', name: '내과', is_active: true },
  { id: 'dep2', name: '피부과', is_active: true },
]

// 내과에는 활성 의사 2명, 피부과에는 0명(전체 현황에서 파생).
const ACTIVE: Record<string, string[]> = { dep1: ['박지훈', '최민석'], dep2: [] }

function renderList(over: Partial<Parameters<typeof DepartmentList>[0]> = {}) {
  const onDeactivate = vi.fn(async (_id: string) => {})
  const onReactivate = vi.fn(async (_id: string) => {})
  const onRename = vi.fn(async (_id: string, _name: string) => {})
  const onGoToStaff = vi.fn()

  function Harness() {
    const [depts, setDepts] = useState<Department[]>(over.departments ?? DEPTS)
    return (
      <DepartmentList
        departments={depts}
        activeDoctorsByDept={over.activeDoctorsByDept ?? ACTIVE}
        onCreate={vi.fn(async () => {})}
        onRename={async (id, name) => {
          await onRename(id, name)
          setDepts((prev) => prev.map((d) => (d.id === id ? { ...d, name } : d)))
        }}
        onDeactivate={async (id) => {
          await onDeactivate(id)
          setDepts((prev) => prev.map((d) => (d.id === id ? { ...d, is_active: false } : d)))
        }}
        onReactivate={onReactivate}
        onGoToStaff={onGoToStaff}
      />
    )
  }
  render(<Harness />)
  return { onDeactivate, onReactivate, onRename, onGoToStaff }
}

const row = (name: string) => document.querySelector(`[data-dept-row="${name}"]`) as HTMLElement
const rowButtons = (name: string) => within(row(name)).getAllByRole('button').map((b) => b.textContent)
const rowButton = (name: string, label: string) => within(row(name)).getByRole('button', { name: label })
const confirmButton = () => within(screen.getByRole('dialog')).getByRole('button', { name: '사용 중지' })

test('[SCHED-DEPT-01][SCHED-DEPT-02] 목록 + 줄마다 [이름 수정][사용 중지] — 삭제 버튼은 없다', () => {
  renderList()
  expect(rowButtons('내과')).toEqual(['이름 수정', '사용 중지'])
  expect(screen.queryByRole('button', { name: /삭제/ })).toBeNull()
})

test('[SCHED-DEPT-03][SCHED-DEPT-05] 활성 의사가 있으면 막고, 이름 목록과 [직원 관리로 가기]를 준다', async () => {
  const user = userEvent.setup()
  const { onDeactivate, onGoToStaff } = renderList()
  await user.click(rowButton('내과', '사용 중지'))
  expect(screen.getByRole('dialog')).toHaveTextContent('이 진료과에 진료 중인 의사 2명이 있습니다')
  expect(screen.getByRole('dialog')).toHaveTextContent('박지훈')
  expect(screen.getByRole('button', { name: '직원 관리로 가기' })).toBeVisible()
  expect(screen.queryByText(/다른 과로 옮기/)).toBeNull()
  expect(onDeactivate).not.toHaveBeenCalled() // 막았으니 끄지 않는다
  await user.click(screen.getByRole('button', { name: '직원 관리로 가기' }))
  expect(onGoToStaff).toHaveBeenCalled()
})

test('[SCHED-DEPT-07][SCHED-DEPT-08] 활성 의사 0명이면 확인 뒤 꺼지고, 회색으로 남아 [다시 사용]이 붙는다', async () => {
  const user = userEvent.setup()
  renderList()
  await user.click(rowButton('피부과', '사용 중지'))
  expect(confirmButton()).not.toHaveClass('is-destructive') // 되돌릴 수 있으므로 빨간 버튼 아님
  await user.click(confirmButton())
  expect(row('피부과')).toHaveClass('is-inactive')
  expect(rowButtons('피부과')).toContain('다시 사용')
})

test('[SCHED-DEPT-11] [이름 수정]은 이름만 바꾸고 목록에 바뀐 이름으로 보인다', async () => {
  const user = userEvent.setup()
  const { onRename } = renderList()
  await user.click(rowButton('내과', '이름 수정'))
  const input = screen.getByLabelText('진료과 이름')
  await user.clear(input)
  await user.type(input, '내과(본관)')
  await user.click(screen.getByRole('button', { name: '저장' }))
  expect(onRename).toHaveBeenCalledWith('dep1', '내과(본관)')
  expect(row('내과(본관)')).toBeInTheDocument()
})

test('[SCHED-DEPT-12] 진료과를 끄면서 소속 의사까지 함께 끄는 버튼을 만들지 않는다', () => {
  renderList()
  expect(screen.queryByRole('checkbox', { name: /소속 의사도 함께/ })).toBeNull()
})

// L33/G1: 클라이언트 사전판정(activeDoctorsByDept)이 서버와 어긋나(0명으로 보여 확인창까지 감) 서버가
// 400(active_doctors)으로 막을 때, 예전엔 결과를 버려 확인창만 닫히고 무동작이었다. 서버가 권위이므로
// 실패를 잡아 「갈 길을 주는」 blocking 창으로 돌린다.
function renderRejecting(err: unknown, activeByDept: Record<string, string[]> = { dep2: [] }) {
  const onDeactivate = vi.fn(async (_id: string) => { throw err })
  render(
    <DepartmentList
      departments={[{ id: 'dep2', name: '피부과', is_active: true }]}
      activeDoctorsByDept={activeByDept}
      onCreate={vi.fn(async () => {})}
      onRename={vi.fn(async () => {})}
      onDeactivate={onDeactivate}
      onReactivate={vi.fn(async () => {})}
      onGoToStaff={vi.fn()}
    />,
  )
  return { onDeactivate }
}

test('[L33][SCHED-DEPT-05] 서버가 활성 의사로 막으면(400) 무동작이 아니라 blocking 창으로 갈 길을 준다', async () => {
  const user = userEvent.setup()
  renderRejecting(
    new ApiError('이 진료과에 진료 중인 의사가 있어 사용을 중지할 수 없습니다.', 400,
      { active_doctors: ['홍길동'], next: '/admin/staff' }),
  )
  await user.click(rowButton('피부과', '사용 중지'))
  await user.click(confirmButton()) // 클라가 0명으로 봐서 확인창이 뜬다
  expect(await screen.findByText('직원 관리로 가기')).toBeVisible()
  expect(screen.getByText('홍길동')).toBeVisible() // 서버가 준 활성 의사
})

test('[L33][G1] 그 밖의 실패는 조용히 사라지지 않고 인라인 문구로 보인다', async () => {
  const user = userEvent.setup()
  renderRejecting(new ApiError('잠시 후 다시 시도해주세요.', 500))
  await user.click(rowButton('피부과', '사용 중지'))
  await user.click(confirmButton())
  expect(await screen.findByRole('alert')).toHaveTextContent('잠시 후 다시 시도해주세요.')
})
