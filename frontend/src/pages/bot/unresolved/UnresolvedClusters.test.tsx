import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { UnresolvedClusters } from './UnresolvedClusters'
import type { QualityApi, UnresolvedResult } from '../../../api/qualityAdmin'

const clusters = [
  { id: 'c1', representative: '주차 어디에 하나요', count: 12 },
  { id: 'c2', representative: '주말에도 하나요', count: 5 },
]
const ok: UnresolvedResult = { kind: 'clusters', clusters, embeddingGap: false }
const mkApi = (o: Partial<QualityApi> = {}) =>
  ({
    listUnresolved: vi.fn().mockResolvedValue(ok),
    getUnresolvedCluster: vi.fn().mockResolvedValue({ representative: '주차 어디에 하나요', questions: ['주차장 어디', '주차 되나요'] }),
    ...o,
  }) as unknown as QualityApi
const range = { from: '2026-08-01', to: '2026-08-19' }

describe('UnresolvedClusters (UNRES-CLUSTER-*)', () => {
  it('[UNRES-CLUSTER-01] 유효 기간을 선택하면 그 기간의 미해결 집계를 조회한다', async () => {
    const api = mkApi()
    render(<UnresolvedClusters api={api} range={range} />)
    await waitFor(() => expect(api.listUnresolved).toHaveBeenCalledWith(range))
  })

  it('[UNRES-CLUSTER-02] 집계 대상을 미해결로만 두고 사유 라벨로 타 인계 사유와 섞지 않는다', async () => {
    render(<UnresolvedClusters api={mkApi()} range={range} />)
    await screen.findByText(/주차 어디에 하나요/)
    expect(screen.getByTestId('unresolved-scope').dataset.scope).toBe('unresolved_only')
  })

  it("[UNRES-CLUSTER-03] 유사 질문을 '대표 질문 + N건'으로 건수 내림차순 표시한다", async () => {
    render(<UnresolvedClusters api={mkApi({ listUnresolved: vi.fn().mockResolvedValue({ kind: 'clusters', clusters: [clusters[1], clusters[0]], embeddingGap: false }) })} range={range} />)
    const rows = await screen.findAllByTestId('cluster-row')
    expect(rows[0]).toHaveTextContent('주차 어디에 하나요')
    expect(rows[0]).toHaveTextContent('12건')
    expect(Number(rows[0].dataset.count)).toBeGreaterThan(Number(rows[1].dataset.count))
  })

  it('[UNRES-CLUSTER-04] 자동 묶음 한계 안내를 항상 함께 표시한다', async () => {
    render(<UnresolvedClusters api={mkApi()} range={range} />)
    expect(await screen.findByText(/실제로 다른 질문이 섞여 있을 수 있습니다/)).toBeVisible()
  })

  it('[UNRES-CLUSTER-05] 묶음 상세를 별도 전체 화면으로 열고 복귀 시 필터·스크롤을 복원한다', async () => {
    const onOpenDetail = vi.fn()
    render(<UnresolvedClusters api={mkApi()} range={range} onOpenDetail={onOpenDetail} />)
    fireEvent.click((await screen.findAllByTestId('cluster-row'))[0])
    expect(onOpenDetail).toHaveBeenCalledWith(expect.objectContaining({ clusterId: 'c1', restore: expect.anything() }))
  })

  it('[UNRES-CLUSTER-06] 상세의 자료 보강은 안내자료 작성으로 이동한다(승인 전 미반영)', async () => {
    const onAddKb = vi.fn()
    render(<UnresolvedClusters api={mkApi()} range={range} detailClusterId="c1" onAddKb={onAddKb} />)
    fireEvent.click(await screen.findByRole('button', { name: /안내자료로 보강/ }))
    expect(onAddKb).toHaveBeenCalledWith(expect.objectContaining({ from: 'unresolved' }))
  })

  it('[UNRES-CLUSTER-07] 집계 성공·0건은 실제 빈 상태로만 표시한다', async () => {
    render(<UnresolvedClusters api={mkApi({ listUnresolved: vi.fn().mockResolvedValue({ kind: 'clusters', clusters: [], embeddingGap: false }) })} range={range} />)
    expect(await screen.findByText(/미해결 질문이 없습니다/)).toBeVisible()
  })

  it('[UNRES-CLUSTER-08] 로딩은 기간을 유지하고 임시 0건이나 이전 기간 결과를 보이지 않는다', () => {
    render(<UnresolvedClusters api={mkApi({ listUnresolved: vi.fn(() => new Promise<UnresolvedResult>(() => {})) })} range={range} />)
    expect(screen.getByLabelText('집계 로딩')).toBeVisible()
    expect(screen.queryByText(/미해결 질문이 없습니다/)).toBeNull()
    expect(screen.queryByTestId('cluster-row')).toBeNull()
  })

  it('[UNRES-CLUSTER-09] 집계 실패는 오류와 같은 기간 재시도를 표시한다', async () => {
    render(<UnresolvedClusters api={mkApi({ listUnresolved: vi.fn().mockRejectedValue(new Error('x')) })} range={range} />)
    expect(await screen.findByText(/집계하지 못했습니다/)).toBeVisible()
    expect(screen.getByRole('button', { name: /다시 시도/ })).toBeVisible()
  })

  it("[UNRES-CLUSTER-10] 집계 계약 부재는 '현재 집계할 수 없음'이며 0건·빈 차트를 만들지 않는다", async () => {
    render(<UnresolvedClusters api={mkApi({ listUnresolved: vi.fn().mockResolvedValue({ kind: 'no_contract' }) })} range={range} />)
    expect(await screen.findByText('현재 집계할 수 없음')).toBeVisible()
    expect(screen.queryByText(/미해결 질문이 없습니다/)).toBeNull()
  })

  it('[UNRES-CLUSTER-11] 임베딩 누락이 있으면 전체 집계라 단정하지 않고 확인 필요를 표시한다', async () => {
    render(<UnresolvedClusters api={mkApi({ listUnresolved: vi.fn().mockResolvedValue({ kind: 'clusters', clusters, embeddingGap: true }) })} range={range} />)
    expect(await screen.findByText(/일부 질문이 집계에서 빠졌을 수 있습니다/)).toBeVisible()
  })
})
