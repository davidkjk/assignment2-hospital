import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QuestionRanking } from './QuestionRanking'
import type { RankingResult } from '../../../api/botStats'

const clusters = {
  kind: 'clusters' as const,
  embeddingGap: false,
  clusters: [
    { id: 'c1', representative: '주차 되나요', count: 42 },
    { id: 'c2', representative: '예약 취소는 어떻게', count: 31 },
  ],
}
const mkApi = (ranking: RankingResult | (() => Promise<RankingResult>) = clusters, o = {}) =>
  ({
    getRanking: typeof ranking === 'function' ? vi.fn(ranking) : vi.fn().mockResolvedValue(ranking),
    getRankingCluster: vi.fn().mockResolvedValue({ representative: '주차 되나요', questions: ['주차 가능?', '주차장 있어요?'] }),
    ...o,
  }) as any

const range = { from: '2026-08-01', to: '2026-08-20' }

describe('QuestionRanking (QTOP-RANK-*)', () => {
  it('[QTOP-RANK-01] 유효한 기간을 선택하면 그 기간의 질문 집계를 조회한다', async () => {
    const api = mkApi()
    render(<QuestionRanking api={api} range={range} onFaqBoost={vi.fn()} />)
    await waitFor(() => expect(api.getRanking).toHaveBeenCalledWith(range))
  })

  it('[QTOP-RANK-02] 답변 성공·실패와 무관하게 전체 질문을 집계한다(미해결만 집계와 섞지 않음)', async () => {
    render(<QuestionRanking api={mkApi()} range={range} onFaqBoost={vi.fn()} />)
    expect(await screen.findByText(/전체 질문 기준/)).toBeVisible()
    expect(screen.queryByText(/미해결 질문만/)).toBeNull()
  })

  it("[QTOP-RANK-03] 유사 질문을 '대표 질문 + N건'으로 묶어 건수 내림차순으로 표시한다", async () => {
    render(<QuestionRanking api={mkApi()} range={range} onFaqBoost={vi.fn()} />)
    const rows = await screen.findAllByTestId('rank-row')
    expect(rows[0]).toHaveTextContent('주차 되나요')
    expect(rows[0]).toHaveTextContent('42건')
    expect(rows[1]).toHaveTextContent('31건') // 내림차순
  })

  it('[QTOP-RANK-04] 자동 유사도 묶음에 다른 질문이 섞일 수 있음을 항상 안내하고 확정 분류처럼 쓰지 않는다', async () => {
    render(<QuestionRanking api={mkApi()} range={range} onFaqBoost={vi.fn()} />)
    expect(
      await screen.findByText(/자동으로 비슷한 질문끼리 묶어본 결과이며 실제로 다른 질문이 섞여 있을 수 있습니다/),
    ).toBeVisible()
  })

  it('[QTOP-RANK-05] 순위 행을 선택하면 묶음 상세를 별도 전체 화면으로 열고, 목록 복귀 시 직전 필터·스크롤을 복원한다', async () => {
    const api = mkApi()
    render(<QuestionRanking api={api} range={range} onFaqBoost={vi.fn()} />)
    fireEvent.click((await screen.findAllByTestId('rank-row'))[0])
    await waitFor(() => expect(api.getRankingCluster).toHaveBeenCalledWith('c1', range))
    expect(await screen.findByText('주차 가능?')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /목록으로/ }))
    // 복귀 시 목록이 그대로(재조회로 스크롤·필터 초기화하지 않음)
    expect(await screen.findByTestId('ranking-list')).toHaveAttribute('data-restored', 'true')
  })

  it('[QTOP-RANK-06] 묶음을 자료로 만들기를 누르면 안내자료 작성으로 연결하며 승인 전에는 반영하지 않는다', async () => {
    const onFaqBoost = vi.fn()
    render(<QuestionRanking api={mkApi()} range={range} onFaqBoost={onFaqBoost} />)
    fireEvent.click((await screen.findAllByTestId('rank-row'))[0])
    fireEvent.click(await screen.findByRole('button', { name: /자료로 만들기/ }))
    expect(onFaqBoost).toHaveBeenCalledWith('c1') // 도착=KBADM(Task20)·승인 경유는 adminBotNav(NAV-ADM-08)
    expect(screen.queryByText(/답변에 반영했습니다/)).toBeNull()
  })

  it("[QTOP-RANK-07] 집계 성공·질문 0건은 '집계할 질문이 없습니다'를 표시한다", async () => {
    render(<QuestionRanking api={mkApi({ kind: 'empty' })} range={range} onFaqBoost={vi.fn()} />)
    expect(await screen.findByText(/집계할 질문이 없습니다/)).toBeVisible()
  })

  it('[QTOP-RANK-08] 집계 중에는 기간을 유지하고 로딩을 표시하며 이전 기간 순위를 새 결과로 보이지 않는다', () => {
    render(<QuestionRanking api={mkApi(() => new Promise(() => {}))} range={range} onFaqBoost={vi.fn()} />)
    expect(screen.getByLabelText('질문 순위 로딩')).toBeVisible()
    expect(screen.queryByTestId('rank-row')).toBeNull()
  })

  it('[QTOP-RANK-09] 집계 실패는 오류·같은 기간 재시도를 표시하고 0건으로 위장하지 않는다', async () => {
    render(<QuestionRanking api={mkApi(() => Promise.reject(new Error('x')))} range={range} onFaqBoost={vi.fn()} />)
    expect(await screen.findByText(/집계하지 못했습니다/)).toBeVisible()
    expect(screen.getByRole('button', { name: /다시 시도/ })).toBeVisible()
    expect(screen.queryByText(/집계할 질문이 없습니다/)).toBeNull()
  })

  it("[QTOP-RANK-10] 서버가 전체 질문 집계를 제공하지 않으면 '현재 집계할 수 없음'을 표시한다(임시 0·합성 순위 금지)", async () => {
    render(<QuestionRanking api={mkApi({ kind: 'no_contract' })} range={range} onFaqBoost={vi.fn()} />)
    expect(await screen.findByText('현재 집계할 수 없음')).toBeVisible()
    expect(screen.queryByTestId('rank-row')).toBeNull()
    expect(screen.queryByText(/집계할 질문이 없습니다/)).toBeNull() // 계약 부재 ≠ 0건
  })

  it('[QTOP-RANK-11] 임베딩 불가 질문이 있으면 전체 질문을 모두 대표한다고 단정하지 않는다', async () => {
    render(<QuestionRanking api={mkApi({ ...clusters, embeddingGap: true })} range={range} onFaqBoost={vi.fn()} />)
    expect(await screen.findByText(/일부 질문은 묶음에 포함되지 않았을 수 있습니다/)).toBeVisible()
  })
})
