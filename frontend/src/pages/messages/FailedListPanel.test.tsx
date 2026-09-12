import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { expect, test } from 'vitest'
import { server } from '../../test/msw/server'
import { FailedListPanel } from './FailedListPanel'
import type { FailedItem, FailedList } from '../../api/messages'

function item(over: Partial<FailedItem> = {}): FailedItem {
  return {
    id: over.id ?? 'n1',
    patient_id: over.patient_id ?? 'p1',
    name: over.name ?? '김환자',
    phone: over.phone ?? '010-****-1234',
    failure_code: over.failure_code ?? 'blocked',
    notification_type: over.notification_type ?? 'staff_direct',
    already_known: over.already_known ?? false,
  }
}

function serve(data: FailedList) {
  server.use(http.get('*/messages/:id/failed', () => HttpResponse.json(data)))
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <FailedListPanel batchId="b1" />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

test('[SEND-FAIL-02] 두 무리가 다 있으면 이름에 건수를 붙인 탭 둘이 보인다', async () => {
  serve({
    call_now: [item({ id: 'a', name: '살아있음' })],
    fix_number: [item({ id: 'b', name: '죽음', patient_id: 'p2' })],
  })
  renderPanel()
  expect(await screen.findByRole('tab', { name: /지금 전화 1/ })).toBeVisible()
  expect(screen.getByRole('tab', { name: /번호 고쳐야 함 1/ })).toBeVisible()
})

test('[SEND-FAIL-05] 한 무리만 있으면 탭 없이 명단만 보인다', async () => {
  serve({ call_now: [item({ name: '홍길동' })], fix_number: [] })
  renderPanel()
  expect(await screen.findByText('홍길동')).toBeVisible()
  expect(screen.queryByRole('tab')).toBeNull()
})

test('[SEND-FAIL-08] 「번호 고쳐야 함」 줄은 /patients/:id 로 가는 [환자 열기]를 갖고, [다시 보내기]는 없다', async () => {
  const user = userEvent.setup()
  serve({
    call_now: [item({ id: 'a', name: '살아있음' })],
    fix_number: [item({ id: 'b', name: '죽음', patient_id: 'p9' })],
  })
  renderPanel()
  await user.click(await screen.findByRole('tab', { name: /번호 고쳐야 함/ }))
  const link = await screen.findByRole('link', { name: '환자 열기' })
  expect(link).toHaveAttribute('href', '/patients/p9')
  expect(screen.queryByRole('button', { name: /다시 보내기/ })).toBeNull()
})

test('[SEND-FAIL-09] 이미 확인된 번호는 접혀 있다가 펼치면 보인다', async () => {
  const user = userEvent.setup()
  serve({
    call_now: [],
    fix_number: [
      item({ id: 'a', name: '새로실패', patient_id: 'p1', already_known: false }),
      item({ id: 'b', name: '이미확인', patient_id: 'p2', already_known: true }),
    ],
  })
  renderPanel()
  expect(await screen.findByText('새로실패')).toBeVisible()
  expect(screen.queryByText('이미확인')).toBeNull()
  await user.click(screen.getByRole('button', { name: /이미 확인된 번호/ }))
  expect(await screen.findByText('이미확인')).toBeVisible()
})
