import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KbApproveFlow } from './KbApproveFlow'
import type { KbAdminApi } from '../../../api/kbAdmin'

const mkApi = (over: Partial<KbAdminApi> = {}): KbAdminApi => ({
  listDocs: vi.fn(),
  getDoc: vi.fn(),
  createDoc: vi.fn(),
  submitEdit: vi.fn(),
  approveDoc: vi.fn().mockResolvedValue(undefined),
  rejectEdit: vi.fn(),
  archiveDoc: vi.fn(),
  listRevisions: vi.fn(),
  ...over,
})

describe('KbApproveFlow', () => {
  it('[KBADM-EDITOR-09] 승인은 되돌릴 수 없음을 알리고 확인창 안에서만 실행된다', async () => {
    const api = mkApi()
    render(<KbApproveFlow api={api} docId="d1" onGotoRevision={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '승인' }))
    expect(screen.getByText(/되돌릴 수 없/)).toBeVisible()
    expect(api.approveDoc).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '승인하여 반영' }))
    expect(api.approveDoc).toHaveBeenCalledWith('d1')
  })

  it('[KBADM-EDITOR-10] 승인 성공 전에는 기존 승인본이 유지됨을 전제로 라이브를 바꾸지 않는다', async () => {
    const api = mkApi({ approveDoc: vi.fn(() => new Promise<void>(() => {})) })
    render(<KbApproveFlow api={api} docId="d1" onGotoRevision={vi.fn()} liveTitle="주차(라이브)" />)
    await userEvent.click(screen.getByRole('button', { name: '승인' }))
    await userEvent.click(screen.getByRole('button', { name: '승인하여 반영' }))
    expect(screen.getByText('주차(라이브)')).toBeVisible()
  })

  it('[KBADM-EDITOR-11] 승인 중에는 재클릭을 막고 \'승인하여 반영 중\'을 표시하며 완료 전 종료하지 않는다', async () => {
    const api = mkApi({ approveDoc: vi.fn(() => new Promise<void>(() => {})) })
    render(<KbApproveFlow api={api} docId="d1" onGotoRevision={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '승인' }))
    const confirm = screen.getByRole('button', { name: '승인하여 반영' })
    await userEvent.click(confirm)
    expect(confirm).toBeDisabled()
    expect(screen.getByText('승인하여 반영 중')).toBeVisible()
  })

  it('[KBADM-EDITOR-12] 승인 실패는 성공으로 추측하지 않고 부분 반영 여부를 확인 필요로 표시한다', async () => {
    const api = mkApi({ approveDoc: vi.fn().mockRejectedValue(new Error('embed')) })
    render(<KbApproveFlow api={api} docId="d1" onGotoRevision={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '승인' }))
    await userEvent.click(screen.getByRole('button', { name: '승인하여 반영' }))
    expect(await screen.findByText(/승인에 실패/)).toBeVisible()
    expect(screen.queryByText('승인되어 AI 상담봇 답변에 반영되었습니다')).toBeNull()
  })

  it('[KBADM-EDITOR-13] 승인 완료는 반영 문구를 표시하고 승인 취소 버튼을 제공하지 않는다', async () => {
    render(<KbApproveFlow api={mkApi()} docId="d1" onGotoRevision={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '승인' }))
    await userEvent.click(screen.getByRole('button', { name: '승인하여 반영' }))
    expect(await screen.findByText('승인되어 AI 상담봇 답변에 반영되었습니다')).toBeVisible()
    expect(screen.queryByRole('button', { name: '승인 취소' })).toBeNull()
  })

  it('[KBADM-EDITOR-14] 승인 후 정정은 수정이력의 이전 버전 [편집]으로 가고 자동 승인·승인 취소가 아니다', async () => {
    const onGotoRevision = vi.fn()
    render(<KbApproveFlow api={mkApi()} docId="d1" onGotoRevision={onGotoRevision} approved />)
    await userEvent.click(screen.getByRole('button', { name: '수정이력 보기' }))
    expect(onGotoRevision).toHaveBeenCalledWith('d1')
    expect(screen.queryByRole('button', { name: '승인 취소' })).toBeNull()
  })
})
