import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QualityReport } from './QualityReport'
import type { QualityApi, QualitySession } from '../../../api/qualityAdmin'

const sessions: QualitySession[] = [
  { id: 's2', at: '2026-08-18T09:00:00Z', questionSummary: '주말 진료', channel: 'web', hasKbSource: false, reported: true, reviewStatus: 'ok' },
  { id: 's1', at: '2026-08-19T09:00:00Z', questionSummary: '주차 문의', channel: 'app', hasKbSource: true, reported: false, reviewStatus: 'unreviewed' },
]
const mkApi = (o: Partial<QualityApi> = {}) =>
  ({
    listQualitySessions: vi.fn().mockResolvedValue({ items: sessions }),
    getQualitySession: vi.fn().mockResolvedValue({ question: '주차 되나요', answer: '안 됩니다', kbSource: '주차 안내', botMessageId: 'm1' }),
    saveQualityCorrection: vi.fn().mockResolvedValue(undefined),
    markQualityOk: vi.fn().mockResolvedValue(undefined),
    ...o,
  }) as unknown as QualityApi
const range = { from: '2026-08-01', to: '2026-08-19' }

describe('QualityReport (QUALITY-REPORT-*)', () => {
  it('[QUALITY-REPORT-01] 기간을 선택하면 목록·상세 패널이 같은 기간을 유지해 조회한다', async () => {
    const api = mkApi()
    render(<QualityReport api={api} range={range} />)
    await waitFor(() => expect(api.listQualitySessions).toHaveBeenCalledWith(range, 1))
  })

  it('[QUALITY-REPORT-02] 개인정보 없이 미검토 우선 최신순 20건을 표시하고 신고여부는 별도 필터로 둔다', async () => {
    render(<QualityReport api={mkApi()} range={range} />)
    const rows = await screen.findAllByTestId('quality-row')
    expect(rows[0].dataset.id).toBe('s1')
    expect(screen.queryByText(/010-/)).toBeNull()
    expect(screen.getByTestId('quality-page-size').dataset.size).toBe('20')
    expect(screen.getByRole('button', { name: /오답 신고만/ })).toBeVisible()
  })

  it("[QUALITY-REPORT-03] 근거·신고 여부를 구분하고 '없음'과 '조회 실패'를 분리한다", async () => {
    render(<QualityReport api={mkApi()} range={range} />)
    const s2 = (await screen.findAllByTestId('quality-row')).find((r) => r.dataset.id === 's2')!
    expect(s2).toHaveTextContent('근거 없음')
    expect(s2).toHaveTextContent('신고')
  })

  it('[QUALITY-REPORT-04] 상세는 왼쪽 목록을 유지한 우측 패널에서 열고 전체 화면으로 열지 않는다(R2-3 예외)', async () => {
    render(<QualityReport api={mkApi()} range={range} selectedId="s1" />)
    expect(await screen.findByTestId('quality-detail-panel')).toBeVisible()
    expect(screen.getByTestId('quality-list')).toBeVisible()
    expect(screen.getByTestId('quality-detail-panel').dataset.fullscreen).toBe('false')
  })

  it('[QUALITY-REPORT-05] 신고가 없던 답변에도 교정을 남기며 교정만으로 승인 자료를 바꾸지 않는다', async () => {
    render(<QualityReport api={mkApi()} range={range} selectedId="s1" />)
    expect(await screen.findByLabelText(/올바른 안내/)).toBeVisible()
  })

  it('[QUALITY-REPORT-06] 교정 저장 중 중복 저장을 막고 입력을 유지한다', async () => {
    const api = mkApi({ saveQualityCorrection: vi.fn(() => new Promise<void>(() => {})) })
    render(<QualityReport api={api} range={range} selectedId="s1" />)
    fireEvent.change(await screen.findByLabelText(/올바른 안내/), { target: { value: '지하 2층' } })
    fireEvent.click(screen.getByRole('button', { name: /교정 저장/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /저장 중/ })).toBeDisabled())
    expect((screen.getByLabelText(/올바른 안내/) as HTMLTextAreaElement).value).toBe('지하 2층')
  })

  it('[QUALITY-REPORT-07] 교정 저장 실패는 입력 보존·재시도이며 반영 완료로 표시하지 않는다', async () => {
    render(<QualityReport api={mkApi({ saveQualityCorrection: vi.fn().mockRejectedValue(new Error('x')) })} range={range} selectedId="s1" />)
    fireEvent.change(await screen.findByLabelText(/올바른 안내/), { target: { value: '지하 2층' } })
    fireEvent.click(screen.getByRole('button', { name: /교정 저장/ }))
    expect(await screen.findByText(/저장하지 못했습니다/)).toBeVisible()
    expect(screen.getByRole('button', { name: /다시 시도/ })).toBeVisible()
    expect((screen.getByLabelText(/올바른 안내/) as HTMLTextAreaElement).value).toBe('지하 2층')
    expect(screen.queryByText(/교정을 저장했습니다/)).toBeNull()
  })

  it('[QUALITY-REPORT-08] 저장 성공은 quality_review로 처리함 등록 안내와 [처리함으로 가기]를 보이고 자동 반영을 표현하지 않는다', async () => {
    const api = mkApi()
    render(<QualityReport api={api} range={range} selectedId="s1" onGoToInbox={vi.fn()} />)
    fireEvent.change(await screen.findByLabelText(/올바른 안내/), { target: { value: '지하 2층' } })
    fireEvent.click(screen.getByRole('button', { name: /교정 저장/ }))
    await waitFor(() => expect(api.saveQualityCorrection).toHaveBeenCalledWith('s1', '지하 2층'))
    expect(await screen.findByText(/처리함에서 \[반영\/반려\] 검토를 거쳐야/)).toBeVisible()
    expect(screen.getByRole('button', { name: /처리함으로 가기/ })).toBeVisible()
  })

  it('[QUALITY-REPORT-09] 조회 성공·0건은 검토할 상담이 없음을 표시한다', async () => {
    render(<QualityReport api={mkApi({ listQualitySessions: vi.fn().mockResolvedValue({ items: [] }) })} range={range} />)
    expect(await screen.findByText(/검토할 상담이 없습니다/)).toBeVisible()
  })

  it('[QUALITY-REPORT-10] 로딩은 기간과 선택 맥락을 유지한 채 로딩을 표시한다', () => {
    render(<QualityReport api={mkApi({ listQualitySessions: vi.fn(() => new Promise<{ items: QualitySession[] }>(() => {})) })} range={range} selectedId="s1" />)
    expect(screen.getByLabelText('품질 목록 로딩')).toBeVisible()
    expect(screen.getByTestId('quality-range').dataset.from).toBe('2026-08-01')
    expect(screen.getByTestId('quality-detail-panel')).toBeInTheDocument() // 선택 유지
  })

  it('[QUALITY-REPORT-11] 조회 실패는 오류·재시도이며 0건·근거 없음으로 위장하지 않는다', async () => {
    render(<QualityReport api={mkApi({ listQualitySessions: vi.fn().mockRejectedValue(new Error('x')) })} range={range} />)
    expect(await screen.findByText(/불러오지 못했습니다/)).toBeVisible()
    expect(screen.queryByText(/검토할 상담이 없습니다/)).toBeNull()
  })

  it('[QUALITY-REPORT-12] 원문 조회 오류는 정상 부재로 위장하지 않고 원문 없이 교정을 막으며 재시도를 준다', async () => {
    render(<QualityReport api={mkApi({ getQualitySession: vi.fn().mockRejectedValue(new Error('x')) })} range={range} selectedId="s1" />)
    expect(await screen.findByText(/원문을 불러오지 못했습니다/)).toBeVisible()
    expect(screen.getByRole('button', { name: /다시 시도/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /교정 저장/ })).toBeNull()
  })
})
