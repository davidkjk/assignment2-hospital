import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatLogSources } from './ChatLogSources'
import type { ChatLogApi, ChatLogSource } from '../../api/staffChatLog'

const api = (listSources: ChatLogApi['listSources']): ChatLogApi => ({ listSources, listLogs: vi.fn() })
const src: ChatLogSource[] = [{ rank: 1, similarity: 0.82, titleSnapshot: '주차 안내', bodySnapshot: '지하 2층' }]

describe('ChatLogSources', () => {
  it('[CHATLOG-LIST-SOURCE-01] 봇 답변이 쓴 승인 근거 자료를 표시한다', async () => {
    render(<ChatLogSources api={api(async () => src)} messageId="m1" />)
    expect(await screen.findByText('주차 안내')).toBeVisible()
  })

  it('[CHATLOG-LIST-SOURCE-02] 근거가 없으면 근거 자료 없음으로 표시하고 꾸미지 않는다', async () => {
    render(<ChatLogSources api={api(async () => [])} messageId="m1" />)
    expect(await screen.findByText('근거 자료 없음')).toBeVisible()
  })

  it('[CHATLOG-LIST-SOURCE-03] 근거 조회 오류는 근거 영역에만 오류·재시도를 표시한다', async () => {
    render(<ChatLogSources api={api(async () => { throw new Error('x') })} messageId="m1" />)
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeVisible()
  })

  it('[CHATLOG-LIST-DETAIL-01] 상세는 별도 전체 화면으로 열고 복귀 시 직전 위치를 복원한다', async () => {
    const onOpenDetail = vi.fn()
    render(
      <ChatLogSources api={api(async () => src)} messageId="m1" onOpenDetail={onOpenDetail} restoreKey="chatlog:web:scroll120" />,
    )
    await userEvent.click(await screen.findByRole('button', { name: /상세 보기/ }))
    expect(onOpenDetail).toHaveBeenCalledWith({ messageId: 'm1', fullscreen: true, restoreKey: 'chatlog:web:scroll120' })
  })
})
