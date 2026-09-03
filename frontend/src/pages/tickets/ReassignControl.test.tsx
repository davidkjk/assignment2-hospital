import { it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReassignControl } from './ReassignControl'
import type { ActiveStaff } from '../../api/staffChatDetail'

const staff: ActiveStaff[] = [
  { id: 'r1', name: '박접수', role: 'reception' },
  { id: 'd1', name: '이의사', role: 'doctor' },
  { id: 'a1', name: '관리자', role: 'admin' },
]

it('[TICKET-DETAIL-REASSIGN-01] 의료판단 티켓은 경고문구만 유지하고 의사에게 전달 없이 일반 이관으로 통일한다', async () => {
  render(<ReassignControl reason="medical_judgment" busy={false} loadStaff={vi.fn(async () => staff)} onReassign={vi.fn()} />)
  // 경고문구는 유지
  expect(await screen.findByRole('note')).toHaveTextContent('임의로 답하지 말고 담당 의사에게 전달하세요')
  // '의사에게 전달' 동작(강조 라벨·버튼)은 제거
  expect(screen.queryByRole('button', { name: '의사에게 전달' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '이관' })).toBeInTheDocument()
  // 이관 대상은 의사 한정이 아니라 모든 활성 직원(접수 포함)
  await waitFor(() => expect(screen.getByText('박접수 · 접수')).toBeInTheDocument())
  expect(screen.getByText('이의사 · 의사')).toBeInTheDocument()
})

it('[TICKET-DETAIL-REASSIGN-05] 일반 이관은 의료판단 강조 없이 모든 활성 직원을 드롭다운에 둔다', async () => {
  render(<ReassignControl reason="general" busy={false} loadStaff={vi.fn(async () => staff)} onReassign={vi.fn()} />)
  expect(screen.queryByRole('note')).not.toBeInTheDocument()
  await waitFor(() => expect(screen.getByText('박접수 · 접수')).toBeInTheDocument())
  expect(screen.getByText('이의사 · 의사')).toBeInTheDocument()
  expect(screen.getByText('관리자 · 관리자')).toBeInTheDocument()
})

it('[TICKET-DETAIL-REASSIGN-02] 재배정 성공은 담당자만 바꾸고 상태는 in_progress로 유지한다(훅이 status 유지)', async () => {
  const onReassign = vi.fn(async () => {})
  render(<ReassignControl reason="general" busy={false} loadStaff={vi.fn(async () => staff)} onReassign={onReassign} />)
  await userEvent.selectOptions(await screen.findByLabelText('이관할 직원'), 'd1')
  await userEvent.click(screen.getByText('이관'))
  expect(onReassign).toHaveBeenCalledWith('d1')
})

it('[TICKET-DETAIL-REASSIGN-03] 요청 중에는 선택과 전달 버튼을 잠그고 처리 중임을 표시한다', async () => {
  render(<ReassignControl reason="general" busy={true} loadStaff={vi.fn(async () => staff)} onReassign={vi.fn()} />)
  await waitFor(() => expect(screen.getByLabelText('이관할 직원')).toBeDisabled())
  expect(screen.getByRole('button', { name: /전달 중/ })).toBeDisabled()
})

it('[TICKET-DETAIL-REASSIGN-04] 재배정 실패면 오류+재시도를 전달 영역에 표시한다', async () => {
  const onReassign = vi.fn(async () => {
    throw new Error('net')
  })
  render(<ReassignControl reason="general" busy={false} loadStaff={vi.fn(async () => staff)} onReassign={onReassign} />)
  await userEvent.selectOptions(await screen.findByLabelText('이관할 직원'), 'd1')
  await userEvent.click(screen.getByText('이관'))
  expect(await screen.findByRole('alert')).toHaveTextContent('다시 시도')
})

it('[TICKET-DETAIL-ASSIGN-02] 별도 담당 지정·내가 맡기 버튼을 두지 않는다(자동 배정과 중복)', () => {
  render(<ReassignControl reason="general" busy={false} loadStaff={vi.fn(async () => [])} onReassign={vi.fn()} />)
  expect(screen.queryByText(/담당 지정|내가 맡기/)).not.toBeInTheDocument()
})
