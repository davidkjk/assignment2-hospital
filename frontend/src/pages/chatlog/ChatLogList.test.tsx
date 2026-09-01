import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatLogList } from './ChatLogList'
import type { ChatLogRow } from '../../api/staffChatLog'

const rows: ChatLogRow[] = [
  { threadId: 'app1', channel: 'app', routeTaken: 'rag', summary: '두통', at: '2026-08-19T00:00:00Z' },
  { threadId: 'web1', channel: 'web', routeTaken: 'handoff', summary: '예약 문의', at: '2026-08-19T01:00:00Z' },
]

describe('ChatLogList', () => {
  it('[CHATLOG-LIST-SCOPE-01] 앱·웹 대화를 같은 목록에서 보여준다', () => {
    render(<ChatLogList rows={rows} phase="ready" filters={{}} onFilter={vi.fn()} onOpen={vi.fn()} />)
    expect(screen.getByText('두통')).toBeVisible() // 앱
    expect(screen.getByText('예약 문의')).toBeVisible() // 웹 — 한 목록
  })

  it('[CHATLOG-LIST-FILTER-01] 채널 필터를 바꾸면 상위에 조건 변경을 알린다', async () => {
    const onFilter = vi.fn()
    render(<ChatLogList rows={rows} phase="ready" filters={{}} onFilter={onFilter} onOpen={vi.fn()} />)
    const channelGroup = screen.getByLabelText('채널')
    await userEvent.click(within(channelGroup).getByRole('button', { name: '웹' }))
    expect(onFilter).toHaveBeenCalledWith({ channel: 'web' })
  })

  it('[CHATLOG-LIST-FILTER-02] 갈래 필터를 바꾸면 route_taken 조건을 상위에 알린다', async () => {
    const onFilter = vi.fn()
    render(<ChatLogList rows={rows} phase="ready" filters={{}} onFilter={onFilter} onOpen={vi.fn()} />)
    const routeGroup = screen.getByRole('group', { name: '갈래' })
    await userEvent.click(within(routeGroup).getByRole('button', { name: '직원 연결' }))
    expect(onFilter).toHaveBeenCalledWith({ routeTaken: 'handoff' })
  })

  it('[CHATLOG-LIST-ROW-01] 행은 채널·갈래를 텍스트로 구분하고 열 수 있다', async () => {
    const onOpen = vi.fn()
    render(<ChatLogList rows={rows} phase="ready" filters={{}} onFilter={vi.fn()} onOpen={onOpen} />)
    const webRow = screen.getByText('예약 문의').closest('button')!
    expect(webRow.textContent).toMatch(/웹/) // 채널 텍스트
    expect(webRow.textContent).toMatch(/직원 연결/) // 갈래(handoff) 텍스트
    await userEvent.click(screen.getByText('예약 문의'))
    expect(onOpen).toHaveBeenCalledWith('web1')
  })

  it('[CHATLOG-LIST-EMPTY-01] 0건은 조회 실패와 구분되는 문구를 쓴다', () => {
    render(<ChatLogList rows={[]} phase="empty" filters={{ channel: 'web' }} onFilter={vi.fn()} onOpen={vi.fn()} />)
    expect(screen.getByText('조건에 맞는 상담 기록이 없습니다')).toBeVisible()
    expect(screen.queryByText(/불러오지 못했|다시 시도/)).toBeNull() // 실패 아님
  })
})
