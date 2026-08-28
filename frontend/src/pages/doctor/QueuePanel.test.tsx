import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { QueuePanel, transitionTargetOnOpen, type DoctorQueueRow } from './QueuePanel'

// [DOCTOR-QUEUE-*][DOCTOR-START-01~03] 오늘 대기 — ⭐ 행을 여는 「행위 자체」가 상태 전이다([진료 시작]
//   버튼 없음). 진료대기일 때만 진료중으로, 그 밖은 전이하지 않는다. 순서는 서버가 정한 대로 지킨다.

const row = (over: Partial<DoctorQueueRow>): DoctorQueueRow => ({
  id: 'a1',
  patient_id: 'p1',
  name: '김*자',
  queue_position: 1,
  waiting_started_at: null,
  status: '진료대기',
  ...over,
})

function renderPanel(over: Partial<Parameters<typeof QueuePanel>[0]> = {}) {
  const onOpen = vi.fn()
  render(
    <QueuePanel
      rows={[row({})]}
      selectedId={null}
      onOpen={onOpen}
      loading={false}
      error={false}
      onRetry={() => {}}
      {...over}
    />,
  )
  return { onOpen }
}

describe('QueuePanel', () => {
  test('[DOCTOR-QUEUE-01] 서버가 준 행만, 그대로 그린다(클라이언트가 임의로 빼지 않는다)', () => {
    renderPanel({
      rows: [
        row({ id: 'a1', status: '도착', name: '김*자' }),
        row({ id: 'a2', status: '진료대기', name: '박*수' }),
        row({ id: 'a3', status: '진료중', name: '이*희' }),
      ],
    })
    expect(screen.getAllByRole('button', { name: /진료대기|도착|진료중/ })).toHaveLength(3)
  })

  test('[DOCTOR-QUEUE-02] 상태를 색이 아니라 글자로도 말한다', () => {
    renderPanel({ rows: [row({ status: '진료중' })] })
    expect(within(screen.getByRole('button')).getByText('진료중')).toBeVisible()
  })

  test('[DOCTOR-QUEUE-03] 서버가 준 순서를 다시 그려도 흔들리지 않는다', () => {
    const rows = [row({ id: 'a1', queue_position: 1 }), row({ id: 'a2', queue_position: 1 }), row({ id: 'a3', queue_position: null })]
    const { rerender } = render(
      <QueuePanel rows={rows} selectedId={null} onOpen={() => {}} loading={false} error={false} onRetry={() => {}} />,
    )
    const ids = () => screen.getAllByRole('button').map((b) => b.getAttribute('data-id'))
    expect(ids()).toEqual(['a1', 'a2', 'a3'])
    rerender(<QueuePanel rows={rows} selectedId={null} onOpen={() => {}} loading={false} error={false} onRetry={() => {}} />)
    expect(ids()).toEqual(['a1', 'a2', 'a3'])
  })

  test('[DOCTOR-QUEUE-04][DOCTOR-START-01] 진료대기 행을 열면 버튼 없이 열리고, 전이 목표는 진료중이다', async () => {
    const user = userEvent.setup()
    const { onOpen } = renderPanel({ rows: [row({ id: 'a1', status: '진료대기' })] })
    expect(screen.queryByRole('button', { name: '진료 시작' })).toBeNull() // 여는 버튼은 없다
    await user.click(screen.getByRole('button', { name: /진료대기/ }))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }))
    expect(transitionTargetOnOpen('진료대기')).toBe('진료중')
  })

  test('[DOCTOR-QUEUE-05][DOCTOR-START-02] 진료대기가 아니면 어떤 상태로도 전이하지 않는다', () => {
    expect(transitionTargetOnOpen('진료중')).toBeNull()
    expect(transitionTargetOnOpen('도착')).toBeNull()
    expect(transitionTargetOnOpen('진료완료')).toBeNull()
  })

  test('[DOCTOR-QUEUE-06] 대기 행을 열 때 동명이인 팝업을 띄우지 않는다', async () => {
    const user = userEvent.setup()
    renderPanel({ rows: [row({ status: '진료대기' })] })
    await user.click(screen.getByRole('button', { name: /진료대기/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('[DOCTOR-QUEUE-07][QUEUE-LIVE-02] 끊기면 기준 시각·낡음 안내와 [지금 새로고침]을 준다', () => {
    renderPanel({ stale: true, lastSyncedAt: '09:41', onRefresh: () => {} })
    expect(screen.getByText(/기준 시각/)).toHaveTextContent('09:41')
    expect(screen.getByRole('button', { name: '지금 새로고침' })).toBeVisible()
  })

  test('[DOCTOR-QUEUE-08][SHELL-ACT-03] 0건 안내엔 갈 길만 주고 예약 버튼을 만들지 않는다', () => {
    renderPanel({ rows: [] })
    expect(screen.getByText('오늘 진료 대기 환자가 없습니다')).toBeVisible()
    expect(screen.getByText(/날짜를 바꿔 과거 환자/)).toBeVisible()
    expect(screen.queryByRole('button', { name: /예약|당일 방문/ })).toBeNull()
  })

  test('[DOCTOR-LOAD-01][EMPTY-LAY-01] 로딩 중 자리 표시자를 그린다(흰 빈 화면 금지)', () => {
    renderPanel({ loading: true })
    expect(screen.getByTestId('skeleton')).toBeVisible()
  })
})
