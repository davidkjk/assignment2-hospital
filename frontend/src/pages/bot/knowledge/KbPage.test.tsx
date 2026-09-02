import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KbPage } from './KbPage'
import type { KbAdminApi, KbDetail, KbDoc, KbRevision } from '../../../api/kbAdmin'

const doc: KbDoc = { id: 'd1', title: '주차 안내', category: '위치·주차', status: 'approved', isRestricted: false, hasPendingEdit: false }
const detail: KbDetail = { ...doc, content: '지하 2층', pendingTitle: null, pendingContent: null }
const rev: KbRevision = { id: 'r1', at: '2026-08-19T00:00:00Z', title: '주차 안내', content: '지하 3층', approvedBy: '김관리' }

const mkApi = (over: Partial<KbAdminApi> = {}): KbAdminApi => ({
  listDocs: vi.fn().mockResolvedValue([doc]),
  getDoc: vi.fn().mockResolvedValue(detail),
  createDoc: vi.fn().mockResolvedValue({ ...doc, id: 'new1', status: 'draft', title: '' }),
  submitEdit: vi.fn().mockResolvedValue(undefined),
  approveDoc: vi.fn().mockResolvedValue(undefined),
  rejectEdit: vi.fn(),
  archiveDoc: vi.fn(),
  listRevisions: vi.fn().mockResolvedValue([rev]),
  ...over,
})

describe('KbPage', () => {
  it('[KbPage] 목록 행을 고르면 오른쪽에 편집기가 열린다', async () => {
    render(<KbPage api={mkApi()} />)
    await userEvent.click(await screen.findByText('주차 안내'))
    expect(await screen.findByDisplayValue('주차 안내')).toBeInTheDocument()
  })

  it('[KbPage] [새 안내자료]는 초안을 만들고 편집기를 연다', async () => {
    const api = mkApi()
    render(<KbPage api={api} />)
    await userEvent.click(screen.getByRole('button', { name: /새 안내자료/ }))
    expect(api.createDoc).toHaveBeenCalled()
    expect(await screen.findByLabelText('내용')).toBeInTheDocument()
  })

  it('[KbPage] 수정이력의 이전 버전 [편집]은 그 내용을 편집기에 채운다(A2)', async () => {
    render(<KbPage api={mkApi()} />)
    await userEvent.click(await screen.findByText('주차 안내'))
    await screen.findByDisplayValue('주차 안내')
    await userEvent.click(screen.getByRole('button', { name: '수정이력 보기' }))
    await userEvent.click((await screen.findAllByRole('button', { name: '편집' }))[0])
    expect(await screen.findByLabelText('내용')).toHaveValue('지하 3층')
  })
})
