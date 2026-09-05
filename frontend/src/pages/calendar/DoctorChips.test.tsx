import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { DoctorChips, type CalendarDoctor } from './DoctorChips'

const DOCTORS: CalendarDoctor[] = [
  { id: 'd1', name: '박지훈', departmentId: 'im', departmentName: '내과', slotMinutes: 15, paletteIndex: 3 },
  { id: 'd2', name: '최민석', departmentId: 'im', departmentName: '내과', slotMinutes: 20, paletteIndex: 1 },
  { id: 'd3', name: '한소연', departmentId: 'os', departmentName: '정형외과', slotMinutes: 30, paletteIndex: 6 },
]
const DEPARTMENTS = [
  { id: 'im', name: '내과' },
  { id: 'os', name: '정형외과' },
]

function setup(over: Partial<React.ComponentProps<typeof DoctorChips>> = {}) {
  const props = {
    doctors: DOCTORS,
    departments: DEPARTMENTS,
    selectedDoctorIds: [] as string[],
    selectedDepartmentId: null as string | null,
    onToggleDoctor: vi.fn(),
    onSelectAll: vi.fn(),
    onSelectDepartment: vi.fn(),
    ...over,
  }
  render(<DoctorChips {...props} />)
  return props
}

test('[CAL-DOC-01] 드롭다운이 아니라 칩을 한 줄에 늘어놓는다', () => {
  setup()
  expect(screen.queryByRole('combobox')).toBeNull()
  expect(screen.getByRole('button', { name: '박지훈' })).toBeVisible()
})

test('[CAL-DOC-02b] 의사 칩을 누르면 그 의사를 선택에 토글한다 — 여러 명을 함께 고를 수 있다', async () => {
  const user = userEvent.setup()
  const props = setup()
  await user.click(screen.getByRole('button', { name: '박지훈' }))
  expect(props.onToggleDoctor).toHaveBeenCalledWith('d1')
})

test('[CAL-DOC-02b] 이미 고른 의사 칩은 눌린 상태로 보인다', () => {
  setup({ selectedDoctorIds: ['d1', 'd3'] })
  expect(screen.getByRole('button', { name: '박지훈' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: '최민석' })).toHaveAttribute('aria-pressed', 'false')
})

test('[CAL-DOC-02] [전체]를 누르면 전체로 돌아온다', async () => {
  const user = userEvent.setup()
  const props = setup({ selectedDoctorIds: ['d1'] })
  await user.click(screen.getByRole('button', { name: '전체' }))
  expect(props.onSelectAll).toHaveBeenCalled()
})

test('[CAL-DOC-04] 진료과 칩이 의사 칩을 그 과로 좁힌다', () => {
  setup({ selectedDepartmentId: 'im' })
  expect(screen.getByRole('button', { name: '박지훈' })).toBeVisible()
  expect(screen.getByRole('button', { name: '최민석' })).toBeVisible()
  expect(screen.queryByRole('button', { name: '한소연' })).toBeNull()
})

test('[CAL-DOC-04] 진료과 칩을 누르면 그 과로 필터를 바꾼다', async () => {
  const user = userEvent.setup()
  const props = setup()
  await user.click(screen.getByRole('button', { name: '정형외과' }))
  expect(props.onSelectDepartment).toHaveBeenCalledWith('os')
})

test('[CAL-DOC-05] 걸린 필터가 항상 보인다 — 「내과만 보는 중」', () => {
  setup({ selectedDepartmentId: 'im' })
  expect(screen.getByText('내과만 보는 중')).toBeVisible()
})
