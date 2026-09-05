import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KbHistory } from './KbHistory'
import type { KbAdminApi, KbRevision } from '../../../api/kbAdmin'

const rev = (over: Partial<KbRevision> = {}): KbRevision => ({
  id: 'r1',
  at: '2026-08-19T00:00:00Z',
  title: '주차 안내',
  content: '지하 2층',
  approvedBy: '김관리',
  ...over,
})
const mkApi = (over: Partial<KbAdminApi> = {}): KbAdminApi => ({
  listDocs: vi.fn(),
  getDoc: vi.fn(),
  createDoc: vi.fn(),
  submitEdit: vi.fn(),
  approveDoc: vi.fn(),
  rejectEdit: vi.fn(),
  archiveDoc: vi.fn(),
  listRevisions: vi.fn().mockResolvedValue([rev({ id: 'r2', at: '2026-08-20T00:00:00Z', content: '지하 3층' }), rev()]),
  ...over,
})

describe('KbHistory', () => {
  it('[KBADM-HISTORY-01] 이전 내용·수정 기록을 최신 시각부터 표시한다', async () => {
    render(<KbHistory api={mkApi()} docId="d1" onEditRevision={vi.fn()} />)
    const rows = await screen.findAllByTestId('kb-rev')
    expect(rows[0].textContent).toContain('지하 3층')
  })

  it('[KBADM-HISTORY-02] 현재 자료 한 건의 이력만 표시하고 다른 자료 이력을 섞지 않는다', async () => {
    const api = mkApi()
    render(<KbHistory api={api} docId="d1" onEditRevision={vi.fn()} />)
    await screen.findAllByTestId('kb-rev')
    expect(api.listRevisions).toHaveBeenCalledWith('d1')
  })

  it('[KBADM-HISTORY-03] 이력 상세는 읽기 전용이고 기록에 없는 사유·승인자를 지어내지 않는다', async () => {
    render(<KbHistory api={mkApi({ listRevisions: vi.fn().mockResolvedValue([rev({ approvedBy: null })]) })} docId="d1" onEditRevision={vi.fn()} />)
    await userEvent.click((await screen.findAllByTestId('kb-rev'))[0])
    expect(screen.getByText('지하 2층')).toBeVisible()
    expect(screen.queryByText(/승인자:/)).toBeNull()
  })

  it('[KBADM-HISTORY-04] 이전 버전 행에 [편집]을 제공하고 승인 취소·되돌리기로 표현하지 않는다', async () => {
    render(<KbHistory api={mkApi()} docId="d1" onEditRevision={vi.fn()} />)
    expect((await screen.findAllByRole('button', { name: '편집' })).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /되돌리기|승인 취소/ })).toBeNull()
  })

  it('[KBADM-HISTORY-05] 이전 버전 [편집]은 그 내용을 새 수정본으로 prefill해 편집 폼으로 넘긴다', async () => {
    const onEditRevision = vi.fn()
    render(<KbHistory api={mkApi()} docId="d1" onEditRevision={onEditRevision} />)
    await userEvent.click((await screen.findAllByRole('button', { name: '편집' }))[0])
    expect(onEditRevision).toHaveBeenCalledWith(expect.objectContaining({ prefillFrom: 'r2', asNewDraft: true }))
  })

  it('[KBADM-HISTORY-06] 이력 0건은 \'이전 수정이력이 없습니다\'이며 현재 내용과 혼동하지 않는다', async () => {
    render(<KbHistory api={mkApi({ listRevisions: vi.fn().mockResolvedValue([]) })} docId="d1" onEditRevision={vi.fn()} />)
    expect(await screen.findByText('이전 수정이력이 없습니다')).toBeVisible()
  })

  it('[KBADM-HISTORY-07] 로딩은 대상 자료 식별을 유지하고 이력 영역에 로딩을 표시한다', () => {
    render(<KbHistory api={mkApi({ listRevisions: vi.fn((): Promise<KbRevision[]> => new Promise(() => {})) })} docId="d1" onEditRevision={vi.fn()} />)
    expect(screen.getByLabelText('이력 로딩')).toBeVisible()
    expect(screen.getByTestId('kb-history').dataset.doc).toBe('d1')
  })

  it('[KBADM-HISTORY-08] 오류는 \'수정이력을 불러오지 못했습니다\'+재시도이며 이력 없음으로 표시하지 않는다', async () => {
    render(<KbHistory api={mkApi({ listRevisions: vi.fn().mockRejectedValue(new Error('x')) })} docId="d1" onEditRevision={vi.fn()} />)
    expect(await screen.findByText('수정이력을 불러오지 못했습니다')).toBeVisible()
    expect(screen.queryByText('이전 수정이력이 없습니다')).toBeNull()
  })

  it('[KBADM-HISTORY-09] 대상 없음은 이유를 추측하지 않고 목록 이동 경로를 제공한다(삭제 정책 확인 필요)', async () => {
    render(
      <KbHistory
        api={mkApi({ listRevisions: vi.fn().mockRejectedValue(Object.assign(new Error('nf'), { status: 404 })) })}
        docId="d1"
        onEditRevision={vi.fn()}
      />,
    )
    expect(await screen.findByText(/자료를 찾을 수 없습니다/)).toBeVisible()
    expect(screen.getByRole('button', { name: /목록으로/ })).toBeVisible()
  })
})
