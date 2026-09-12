import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useChatLogs } from './useChatLogs'
import type { ChatLogApi, ChatLogRow } from '../../api/staffChatLog'

const row = (over: Partial<ChatLogRow> = {}): ChatLogRow => ({
  threadId: 'th1', channel: 'app', routeTaken: 'rag', summary: '두통', at: '2026-08-19T00:00:00Z', ...over,
})
const api = (listLogs: ChatLogApi['listLogs'], listCounts?: ChatLogApi['listCounts']): ChatLogApi => ({
  listLogs,
  listSources: vi.fn(),
  listCounts: listCounts ?? vi.fn(async () => ({ total: 0, counts: {} })),
})

describe('useChatLogs', () => {
  it('[CHATLOG-LIST-FILTER-03] 필터를 바꾸면 새 조건으로 다시 조회한다', async () => {
    const listLogs = vi.fn(async (q) => (q.channel === 'web' ? [row({ channel: 'web' })] : [row()]))
    const { result } = renderHook(() => useChatLogs(api(listLogs)))
    await waitFor(() => expect(result.current.phase).toBe('ready'))
    await act(async () => result.current.setFilter({ channel: 'web' }))
    await waitFor(() => expect(listLogs).toHaveBeenLastCalledWith({ channel: 'web' }))
    expect(result.current.rows[0].channel).toBe('web')
  })

  it('[CHATLOG-LIST-LOAD-01] 최초 로딩은 loading이며 0건 문구를 먼저 내지 않는다', async () => {
    let resolve!: (v: ChatLogRow[]) => void
    const { result } = renderHook(() => useChatLogs(api(() => new Promise((r) => (resolve = r)))))
    expect(result.current.phase).toBe('loading')
    expect(result.current.phase).not.toBe('empty')
    await act(async () => resolve([]))
  })

  it('[CHATLOG-LIST-ERR-01] 조회 실패는 error이며 0건으로 위장하지 않는다', async () => {
    const { result } = renderHook(() => useChatLogs(api(async () => { throw new Error('x') })))
    await waitFor(() => expect(result.current.phase).toBe('error'))
    expect(result.current.phase).not.toBe('empty')
  })

  it('[CHATLOG-LIST-LIVE-01] Realtime 구독 여부는 근거가 없어 unknown으로 노출하고 임의로 켜지 않는다', async () => {
    const { result } = renderHook(() => useChatLogs(api(async () => [row()])))
    await waitFor(() => expect(result.current.phase).toBe('ready'))
    expect(result.current.live.mode).toBe('unknown')
  })

  it('[CHATLOG-LIST-ORDER-01] 정렬 방향·동점 키·페이지는 근거가 없어 unknown으로 노출한다', async () => {
    const { result } = renderHook(() => useChatLogs(api(async () => [row()])))
    await waitFor(() => expect(result.current.phase).toBe('ready'))
    expect(result.current.order.contract).toBe('unknown')
  })

  it('[CHATLOG-LIST-EXC-01] 계약 밖 채널·갈래 값을 임의 치환하지 않고 알 수 없는 값으로 보존한다', async () => {
    const { result } = renderHook(() => useChatLogs(api(async () => [row({ channel: 'sms', routeTaken: '??' })])))
    await waitFor(() => expect(result.current.phase).toBe('ready'))
    expect(result.current.rows[0].channel).toBe('sms')
    expect(result.current.rows[0].routeTaken).toBe('??')
  })

  it('[CHATLOG-LIST-COUNT] 갈래 개수는 채널·기간만으로 조회하고(갈래 무관) 배지로 노출한다', async () => {
    const listCounts = vi.fn(async () => ({ total: 8, counts: { handoff: 4, rag: 2 } }))
    const { result } = renderHook(() => useChatLogs(api(async () => [row()], listCounts)))
    await waitFor(() => expect(result.current.counts.total).toBe(8))
    expect(result.current.counts.counts.handoff).toBe(4)
    // 갈래를 바꿔도 개수는 다시 세지 않는다(개수는 갈래 필터 무관).
    listCounts.mockClear()
    await act(async () => result.current.setFilter({ routeTaken: 'handoff' }))
    await waitFor(() => expect(result.current.filters.routeTaken).toBe('handoff'))
    expect(listCounts).not.toHaveBeenCalled()
  })

  it('[CHATLOG-LIST-PERIOD] 기간을 바꾸면 filters의 from·to가 채워지고 전체면 비운다', async () => {
    const listLogs = vi.fn(async () => [row()])
    const { result } = renderHook(() => useChatLogs(api(listLogs)))
    await waitFor(() => expect(result.current.phase).toBe('ready'))
    await act(async () => result.current.setPeriod({ preset: '최근 7일', from: '2026-08-16', to: '2026-08-22' }))
    await waitFor(() => expect(result.current.filters.from).toBe('2026-08-16'))
    expect(result.current.filters.to).toBe('2026-08-22')
    await act(async () => result.current.setPeriod({ preset: '전체', from: '', to: '2026-08-22' }))
    await waitFor(() => expect(result.current.filters.from).toBeUndefined())
    expect(result.current.filters.to).toBeUndefined()
  })
})
