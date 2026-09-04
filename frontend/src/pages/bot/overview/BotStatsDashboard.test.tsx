import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BotStatsDashboard } from './BotStatsDashboard'
import type { BotMetrics } from '../../../api/botStats'

const V = (count: number, drillable = true) => ({ kind: 'value' as const, count, drillable })
const full: BotMetrics = {
  inflow: { kind: 'value', app: 60, staff: 30, chatbot: 10 },
  inquiries: V(120),
  selfServed: V(80),
  handedOff: V(40, false),
}
const mkApi = (metrics: BotMetrics | (() => Promise<BotMetrics>) = full, o = {}) =>
  ({
    getMetrics: typeof metrics === 'function' ? vi.fn(metrics) : vi.fn().mockResolvedValue(metrics),
    getRanking: vi.fn().mockResolvedValue({ kind: 'empty' }),
    getRankingCluster: vi.fn(),
    getDrill: vi.fn().mockResolvedValue([{ patientMasked: '홍*동', at: '2026-08-10' }]),
    exportCsv: vi.fn().mockResolvedValue(new Blob(['기간,값\n'], { type: 'text/csv' })),
    ...o,
  }) as any
const range = { from: '2026-08-01', to: '2026-08-20' }
const audit = vi.fn()

describe('BotStatsDashboard (BOTSTAT-DASH-*)', () => {
  beforeEach(() => audit.mockClear())

  it('[BOTSTAT-DASH-01] 선택 기간을 같은 화면에서 조회하고 결과 제목에 기간을 표시한다', async () => {
    const api = mkApi()
    render(<BotStatsDashboard api={api} range={range} onAudit={audit} />)
    await waitFor(() => expect(api.getMetrics).toHaveBeenCalledWith(range))
    expect(await screen.findByText(/2026-08-01 ~ 2026-08-20/)).toBeVisible()
  })

  it('[BOTSTAT-DASH-02] 예약 유입원을 app·staff·chatbot 별도 비율로 표시하고 챗봇을 앱/직원에 섞지 않는다', async () => {
    render(<BotStatsDashboard api={mkApi()} range={range} onAudit={audit} />)
    const inflow = await screen.findByTestId('inflow')
    expect(inflow).toHaveTextContent('앱 60%')
    expect(inflow).toHaveTextContent('직원 30%')
    expect(inflow).toHaveTextContent('챗봇 10%')
  })

  it('[BOTSTAT-DASH-02] 서버가 준 건수(합≠100)를 총합으로 나눠 비율로 환산하고 100%를 넘기지 않는다', async () => {
    // 실 서버는 유입원을 건수(원값)로 준다(예: 1115/691/294) → 그대로 %로 찍으면 1115% 처럼 100%를 넘는 회귀.
    render(<BotStatsDashboard api={mkApi({ ...full, inflow: { kind: 'value', app: 1115, staff: 691, chatbot: 294 } })} range={range} onAudit={audit} />)
    const inflow = await screen.findByTestId('inflow')
    expect(inflow).toHaveTextContent('앱 53%')
    expect(inflow).toHaveTextContent('직원 33%')
    expect(inflow).toHaveTextContent('챗봇 14%')
    expect(inflow).not.toHaveTextContent('1115%')
  })

  it('[BOTSTAT-DASH-03] 상담봇 지표(문의 수·자체 안내·직원 연결)를 예약 지표와 분리된 묶음으로 표시한다', async () => {
    render(<BotStatsDashboard api={mkApi()} range={range} onAudit={audit} />)
    const bot = await screen.findByTestId('bot-metrics')
    expect(bot).toHaveTextContent('문의 수120')
    expect(bot).toHaveTextContent('자체 안내80')
    expect(bot).toHaveTextContent('직원 연결40')
  })

  it("[BOTSTAT-DASH-04] 계약 존재·실제 0건은 '0건'을 표시하고 기간을 바꿀 수 있게 둔다", async () => {
    render(<BotStatsDashboard api={mkApi({ ...full, inquiries: V(0) })} range={range} onAudit={audit} />)
    expect(await screen.findByTestId('metric-inquiries')).toHaveTextContent('0건')
    expect(screen.getByLabelText(/기간/)).toBeVisible()
  })

  it("[BOTSTAT-DASH-05] 집계 계약이 없으면 '현재 집계할 수 없음'을 표시하고 placeholder 0·빈 차트를 금지한다", async () => {
    render(<BotStatsDashboard api={mkApi({ ...full, inflow: { kind: 'no_contract' } })} range={range} onAudit={audit} />)
    expect(await screen.findByTestId('inflow')).toHaveTextContent('현재 집계할 수 없음')
    expect(screen.getByTestId('inflow')).not.toHaveTextContent('0%')
  })

  it("[BOTSTAT-DASH-06] 일부 지표만 집계 가능하면 가능한 것만 실제 값·나머지는 각각 '현재 집계할 수 없음'(묶음 전체를 0으로 만들지 않음)", async () => {
    render(<BotStatsDashboard api={mkApi({ ...full, selfServed: { kind: 'no_contract' } })} range={range} onAudit={audit} />)
    expect(await screen.findByTestId('metric-inquiries')).toHaveTextContent('120') // 실제 값 유지
    expect(screen.getByTestId('metric-selfServed')).toHaveTextContent('현재 집계할 수 없음')
    expect(screen.getByTestId('metric-selfServed')).not.toHaveTextContent('0건')
  })

  it('[BOTSTAT-DASH-07] 조회 중에는 기간을 유지하고 로딩을 표시하며 이전 결과를 새 응답으로 가장하지 않는다', () => {
    render(<BotStatsDashboard api={mkApi(() => new Promise(() => {}))} range={range} onAudit={audit} />)
    expect(screen.getByLabelText('현황 로딩')).toBeVisible()
    expect(screen.queryByTestId('bot-metrics')).toBeNull()
  })

  it('[BOTSTAT-DASH-08] 서버·유효성 오류는 오류·같은 기간 재시도를 표시하고 마지막 결과·0건을 현재 값처럼 표시하지 않는다', async () => {
    render(<BotStatsDashboard api={mkApi(() => Promise.reject(new Error('x')))} range={range} onAudit={audit} />)
    expect(await screen.findByText(/불러오지 못했습니다/)).toBeVisible()
    expect(screen.getByRole('button', { name: /다시 시도/ })).toBeVisible()
    expect(screen.queryByText('0건')).toBeNull()
  })

  it('[BOTSTAT-DASH-09] 오프라인은 캐시를 최신 집계로 가장하지 않고 오프라인·재시도를 표시한다', async () => {
    render(
      <BotStatsDashboard
        api={mkApi(() => Promise.reject(Object.assign(new Error('off'), { offline: true })))}
        range={range}
        onAudit={audit}
      />,
    )
    expect(await screen.findByText(/오프라인/)).toBeVisible()
    expect(screen.getByRole('button', { name: /다시 시도/ })).toBeVisible()
  })

  it('[BOTSTAT-DASH-10] 상세 계약 있는 숫자 카드만 상세를 열고, 상세 계약 없는 지표는 클릭 가능하게 가장하지 않는다', async () => {
    const api = mkApi()
    render(<BotStatsDashboard api={api} range={range} onAudit={audit} />)
    fireEvent.click(await screen.findByTestId('metric-inquiries')) // drillable:true
    await waitFor(() => expect(api.getDrill).toHaveBeenCalledWith('inquiries', range))
    expect(screen.getByTestId('metric-handedOff')).toHaveAttribute('aria-disabled', 'true') // drillable:false
  })

  it('[BOTSTAT-DASH-11] 드릴다운 명단은 서버가 준 마스킹 표시값만 쓰고 원본을 클라이언트가 가공하지 않는다', async () => {
    render(<BotStatsDashboard api={mkApi()} range={range} onAudit={audit} />)
    fireEvent.click(await screen.findByTestId('metric-inquiries'))
    expect(await screen.findByText('홍*동')).toBeVisible() // 서버 마스킹 그대로
  })

  it('[BOTSTAT-DASH-12] CSV는 현재 기간·지표 기준 집계로 생성하고 환자 상세 명단을 자동 포함하지 않는다', async () => {
    const api = mkApi()
    render(<BotStatsDashboard api={api} range={range} onAudit={audit} />)
    fireEvent.click(await screen.findByRole('button', { name: /CSV 내보내기/ }))
    await waitFor(() => expect(api.exportCsv).toHaveBeenCalledWith(range))
  })

  it('[BOTSTAT-DASH-13] CSV에서만 5건 미만 셀을 가리고 이유를 표시하며, 화면 수치엔 이 억제를 적용하지 않는다', async () => {
    // 화면은 소수 셀도 그대로 공개
    render(<BotStatsDashboard api={mkApi({ ...full, handedOff: V(3, false) })} range={range} onAudit={audit} />)
    expect(await screen.findByTestId('metric-handedOff')).toHaveTextContent('3건') // 화면은 억제 없음
    expect(screen.getByTestId('metric-handedOff')).not.toHaveTextContent('소수 인원 보호')
    // CSV 다운로드 직전 억제 안내 한 줄
    fireEvent.click(screen.getByRole('button', { name: /CSV 내보내기/ }))
    expect(await screen.findByText(/소수 인원 보호로 일부 셀이 비공개될 수 있습니다/)).toBeVisible()
  })

  it('[BOTSTAT-DASH-14] 집계 계약 없음·조회 실패·오프라인이면 다운로드를 실행하지 않고 빈/0건 파일을 만들지 않는다', async () => {
    const api = mkApi(() => Promise.reject(new Error('x')))
    render(<BotStatsDashboard api={api} range={range} onAudit={audit} />)
    await screen.findByText(/불러오지 못했습니다/)
    expect(screen.queryByRole('button', { name: /CSV 내보내기/ })).toBeNull() // 조회 실패 상태에선 내보내기 자체가 없음
    expect(api.exportCsv).not.toHaveBeenCalled()
  })

  it('[BOTSTAT-DASH-15] 상세 열기·CSV는 실행자·시각·지표·기간·대상 건수·억제 여부만 감사하고 환자명·전화·검색어를 payload에 넣지 않는다', async () => {
    render(<BotStatsDashboard api={mkApi()} range={range} onAudit={audit} />)
    fireEvent.click(await screen.findByTestId('metric-inquiries'))
    await waitFor(() => expect(audit).toHaveBeenCalled())
    const payload = audit.mock.calls[0][0]
    expect(payload).toMatchObject({ action: 'stats_drilldown', metric: 'inquiries', from: range.from, to: range.to })
    expect(JSON.stringify(payload)).not.toContain('홍*동') // 환자명·마스킹 명단도 payload에 복사 안 함
  })
})

describe('BotStatsDashboard 조립 (116→117 흡수)', () => {
  it("[Step4] 상담봇 처리 현황 화면 하나 안에 '운영 지표'와 '많이 들어온 질문' 두 섹션이 함께 있고 별도 라우트가 없다", async () => {
    render(<BotStatsDashboard api={mkApi()} range={range} onAudit={audit} />)
    expect(await screen.findByRole('heading', { name: /운영 지표/ })).toBeVisible()
    expect(screen.getByRole('heading', { name: /많이 들어온 질문/ })).toBeVisible() // 116 섹션이 117 안에
  })
})
