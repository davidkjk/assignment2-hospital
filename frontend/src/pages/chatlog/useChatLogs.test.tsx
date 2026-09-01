import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useChatLogs } from './useChatLogs'
import type { ChatLogApi, ChatLogRow } from '../../api/staffChatLog'

const row = (over: Partial<ChatLogRow> = {}): ChatLogRow => ({
  threadId: 'th1', channel: 'app', routeTaken: 'rag', summary: '두통', at: '2026-08-19T00:00:00Z', ...over,
})
const api = (listLogs: ChatLogApi['listLogs']): ChatLogApi => ({ listLogs, listSources: vi.fn() })

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
})
