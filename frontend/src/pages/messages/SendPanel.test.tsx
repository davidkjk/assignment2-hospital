import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { expect, test } from 'vitest'
import { server } from '../../test/msw/server'
import { PanelProvider } from '../../components/PanelHost'
import { SendPanel } from './SendPanel'
import type { EnqueueResult } from '../../api/messages'
import type { Recipients } from './RecipientField'

function result(over: Partial<EnqueueResult> = {}): EnqueueResult {
  return {
    target_count: over.target_count ?? 1,
    sms_count: over.sms_count ?? 1,
    marketing_excluded: over.marketing_excluded ?? 0,
    notification_ids: over.notification_ids ?? ['n1'],
    scheduled_id: over.scheduled_id ?? null,
    night_blocked: over.night_blocked ?? false,
    suggested_at: over.suggested_at ?? null,
  }
}

function postReturns(res: EnqueueResult) {
  server.use(http.post('*/messages', () => HttpResponse.json(res)))
}

function renderPanel(initialRecipients?: Recipients) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PanelProvider>
          <SendPanel initialRecipients={initialRecipients} />
        </PanelProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

test('[SEND-KIND-02] 종류의 기본값은 「안내」다', () => {
  renderPanel()
  expect(screen.getByLabelText('종류')).toHaveValue('transactional')
})

test('[SEND-CH-01] 보내는 방법은 세 가지다', () => {
  renderPanel()
  const options = within(screen.getByLabelText('보내는 방법')).getAllByRole('option')
  expect(options.map((o) => o.textContent)).toEqual([
    '앱 알림 + 못 받는 사람은 문자',
    '앱 알림만',
    '모두에게 문자도',
  ])
})

test('[SEND-CH-04] 「모두에게 문자도」를 고르면 문자 건수·비용이 그 자리에 보인다', async () => {
  const user = userEvent.setup()
  renderPanel({ mode: 'pick', ids: ['p1', 'p2'] })
  await user.selectOptions(screen.getByLabelText('보내는 방법'), 'sms')
  expect(screen.getByText('문자 2건에 비용이 듭니다')).toBeVisible()
})

test('[SEND-CH-04] 「앱 알림만」이면 문자 비용 안내가 없다', async () => {
  const user = userEvent.setup()
  renderPanel({ mode: 'pick', ids: ['p1', 'p2'] })
  await user.selectOptions(screen.getByLabelText('보내는 방법'), 'push')
  expect(screen.queryByText(/문자 .*건에 비용이 듭니다/)).toBeNull()
})

test('[SEND-ALL-04] 전 환자 발송은 안내여도 보내기 전 미리보기를 띄운다', async () => {
  const user = userEvent.setup()
  postReturns(result())
  renderPanel()
  await user.click(screen.getByRole('button', { name: '전 환자에게 보내기' }))
  await user.type(screen.getByLabelText('내용'), '전체 공지')
  await user.click(screen.getByRole('button', { name: '보내기' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('전 환자')
})

test('[SEND-ADS-04] 광고 미리보기엔 (광고)·무료 수신거부가 붙어 보인다', async () => {
  const user = userEvent.setup()
  renderPanel({ mode: 'pick', ids: ['p1'] })
  await user.selectOptions(screen.getByLabelText('종류'), 'marketing')
  await user.type(screen.getByLabelText('내용'), '여름 이벤트')
  await user.click(screen.getByRole('button', { name: '보내기' }))
  const dialog = screen.getByRole('dialog')
  expect(dialog).toHaveTextContent('(광고) 여름 이벤트')
  expect(dialog).toHaveTextContent('무료 수신거부')
})

test('[SEND-NIGHT-02] 야간 광고 즉시발송은 예약 제안(내일 08:00)을 띄운다', async () => {
  const user = userEvent.setup()
  postReturns(result({ night_blocked: true, suggested_at: '2026-09-11T08:00:00+09:00' }))
  renderPanel({ mode: 'pick', ids: ['p1'] })
  await user.selectOptions(screen.getByLabelText('종류'), 'marketing')
  await user.type(screen.getByLabelText('내용'), '야간 이벤트')
  await user.click(screen.getByRole('button', { name: '보내기' }))
  // 미리보기 → 보내기 확정 → 야간 차단 응답 → 예약 제안
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '보내기' }))
  expect(await screen.findByText('나중에 보내도록 예약할까요?')).toBeVisible()
  expect(screen.getByRole('button', { name: '내일 08:00' })).toBeVisible()
})
