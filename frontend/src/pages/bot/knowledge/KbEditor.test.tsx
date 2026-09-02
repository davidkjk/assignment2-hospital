import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KbEditor } from './KbEditor'
import type { KbAdminApi, KbDetail } from '../../../api/kbAdmin'

const detail = (over: Partial<KbDetail> = {}): KbDetail => ({
  id: 'd1',
  title: '주차 안내',
  category: '위치·주차',
  status: 'approved',
  isRestricted: false,
  hasPendingEdit: false,
  content: '지하 2층',
  pendingTitle: null,
  pendingContent: null,
  ...over,
})
const mkApi = (over: Partial<KbAdminApi> = {}): KbAdminApi => ({
  listDocs: vi.fn(),
  getDoc: vi.fn().mockResolvedValue(detail()),
  createDoc: vi.fn(),
  submitEdit: vi.fn().mockResolvedValue(undefined),
  approveDoc: vi.fn(),
  rejectEdit: vi.fn(),
  archiveDoc: vi.fn(),
  listRevisions: vi.fn(),
  ...over,
})

describe('KbEditor', () => {
  it('[KBADM-EDITOR-01] 저장만으로 공개하지 않는다(승인 버튼과 저장 버튼이 다르다)', async () => {
    render(<KbEditor api={mkApi()} docId="d1" />)
    await screen.findByDisplayValue('주차 안내')
    expect(screen.getByRole('button', { name: '저장' })).toBeVisible()
    expect(screen.getByRole('button', { name: '승인' })).toBeVisible()
  })

  it('[KBADM-EDITOR-02] 분류 선택지에 진료과·의사 소개, 진료시간·휴진일을 제공하지 않는다', async () => {
    render(<KbEditor api={mkApi()} docId="d1" />)
    const opts = Array.from((await screen.findByLabelText('분류')).querySelectorAll('option')).map((o) => o.textContent)
    expect(opts).not.toContain('진료과·의사 소개')
    expect(opts).not.toContain('진료시간·휴진일')
  })

  it('[KBADM-EDITOR-03] 제한 체크박스 이름은 정확히 지정 문구이고 저장값은 is_restricted다', async () => {
    const api = mkApi()
    render(<KbEditor api={api} docId="d1" />)
    const cb = await screen.findByLabelText('상담봇이 직접 답변하지 않고 이 문구만 그대로 보여줍니다')
    await userEvent.click(cb)
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(api.submitEdit).toHaveBeenCalledWith('d1', expect.objectContaining({ isRestricted: true }))
  })

  it('[KBADM-EDITOR-05] 승인된 자료만 답변 근거임을 표시로 알린다(미승인은 근거 아님)', async () => {
    render(<KbEditor api={mkApi({ getDoc: vi.fn().mockResolvedValue(detail({ status: 'draft' })) })} docId="d1" />)
    expect(await screen.findByText(/승인해야 답변에 반영/)).toBeVisible()
  })

  it('[KBADM-EDITOR-06] 저장은 pending에 담고 현재 승인본을 즉시 바꾸지 않는다', async () => {
    const api = mkApi()
    render(<KbEditor api={api} docId="d1" />)
    await userEvent.clear(await screen.findByLabelText('내용'))
    await userEvent.type(screen.getByLabelText('내용'), '지하 3층')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(api.submitEdit).toHaveBeenCalled()
    expect(api.approveDoc).not.toHaveBeenCalled()
  })

  it('[KBADM-EDITOR-07] 저장 중에는 중복 저장을 막고 편집값을 유지한다', async () => {
    const api = mkApi({ submitEdit: vi.fn(() => new Promise<void>(() => {})) })
    render(<KbEditor api={api} docId="d1" />)
    const save = await screen.findByRole('button', { name: '저장' })
    await userEvent.click(save)
    expect(save).toBeDisabled()
    expect(screen.getByLabelText('내용')).toHaveValue('지하 2층')
  })

  it('[KBADM-EDITOR-08] 저장 실패는 편집값을 보존하고 재시도를 표시하며 승인된 것으로 표시하지 않는다', async () => {
    const api = mkApi({ submitEdit: vi.fn().mockRejectedValue(new Error('net')) })
    render(<KbEditor api={api} docId="d1" />)
    await userEvent.click(await screen.findByRole('button', { name: '저장' }))
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeVisible()
    expect(screen.getByLabelText('내용')).toHaveValue('지하 2층')
    expect(screen.queryByText(/반영되었습니다/)).toBeNull()
  })

  it('[KBADM-EDITOR-15] 기존 자료 로딩 중에는 빈 새 자료처럼 보이지 않고 로딩을 표시한다', () => {
    const api = mkApi({ getDoc: vi.fn((): Promise<KbDetail> => new Promise(() => {})) })
    render(<KbEditor api={api} docId="d1" />)
    expect(screen.getByLabelText('자료 로딩')).toBeVisible()
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull()
  })

  it('[KBADM-EDITOR-16] 기존 자료 로딩 오류는 새 자료 작성으로 전환하지 않고 오류·재시도를 표시한다', async () => {
    const api = mkApi({ getDoc: vi.fn().mockRejectedValue(new Error('x')) })
    render(<KbEditor api={api} docId="d1" />)
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeVisible()
    expect(screen.queryByLabelText('내용')).toBeNull() // 빈 새 폼으로 전환하지 않는다
  })

  it('[KBADM-EDITOR-17] 기존 KB에 의사 소개·진료시간 자료가 남아 있으면 재승인을 막고 원본 관리를 안내한다', async () => {
    render(<KbEditor api={mkApi({ getDoc: vi.fn().mockResolvedValue(detail({ category: '진료시간·휴진일' })) })} docId="d1" />)
    expect(await screen.findByText(/정본 원본으로 관리/)).toBeVisible()
    expect(screen.getByRole('button', { name: '승인' })).toBeDisabled()
  })
})
