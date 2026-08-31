import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { QuestionnaireSection, type QnrItem, type QnrStatus } from './QuestionnaireSection'
import type { SectionState } from './format'

function ready(items: QnrItem[]): SectionState<QnrItem[]> {
  return { loading: false, error: false, data: items, retry: () => {} }
}
const READY_EMPTY: SectionState<QnrItem[]> = { loading: false, error: false, data: [], retry: () => {} }

const ITEM: QnrItem = {
  appointment_id: 'a1',
  visit_date: '2026-08-05',
  submitted_at: '2026-08-04T21:10:00+09:00',
  answers: { '복용 중인 약': '혈압약' },
}

describe('QuestionnaireSection', () => {
  test('[PTDET-QNR-01] 담당 의사에겐 진료일·제출 시각·질문/답변이 머리와 함께 나온다', () => {
    render(<QuestionnaireSection role="doctor" state={ready([ITEM])} />)
    expect(screen.getByText('8/5 진료')).toBeVisible()
    expect(screen.getByText(/8\/4 21:10 제출/)).toBeVisible()
    // 질문은 <dt>(role="term")로, 답은 <dd>로 짝지어 나온다.
    const term = screen.getByText('복용 중인 약')
    expect(term.tagName).toBe('DT')
    expect(screen.getByText('혈압약')).toBeVisible()
  })

  test('[PTDET-QNR-03][A안] 관리자에겐 답변 내용은 감추고 작성 여부만 보인다', () => {
    const statuses: QnrStatus[] = [
      { appointment_id: 'a1', visit_date: '2026-08-05', submitted_at: '2026-08-04T21:10:00+09:00' },
      { appointment_id: 'a2', visit_date: '2026-09-01', submitted_at: null },
    ]
    render(<QuestionnaireSection role="admin" state={READY_EMPTY} statuses={statuses} />)
    // 내용 보호 안내 + 작성 여부 배지.
    expect(screen.getByText('답변 내용은 담당 의사만 열람합니다')).toBeVisible()
    expect(screen.getByText('작성완료')).toBeVisible()
    expect(screen.getByText('미작성')).toBeVisible()
    // 답변 내용은 절대 새지 않는다.
    expect(screen.queryByText('혈압약')).toBeNull()
    // 내부 원인(RLS·정책)은 감춘다.
    expect(document.body).not.toHaveTextContent(/RLS|permission|policy/i)
    // 가짜 버튼(죽은 「담당 의사에게 문의」)은 없다.
    expect(screen.queryByRole('button', { name: /담당 의사에게/ })).toBeNull()
  })

  test('[PTDET-QNR-04][A안] 미작성 환자엔 「문진표 요청」으로 안내를 보낼 경로가 있다', async () => {
    const onRequest = vi.fn()
    const statuses: QnrStatus[] = [{ appointment_id: 'a2', visit_date: '2026-09-01', submitted_at: null }]
    render(<QuestionnaireSection role="receptionist" state={READY_EMPTY} statuses={statuses} onRequest={onRequest} />)
    const btn = screen.getByRole('button', { name: '문진표 요청' })
    expect(btn).toBeVisible()
    btn.click()
    expect(onRequest).toHaveBeenCalledOnce()
  })

  test('[PTDET-QNR-04] 의사의 0건은 「작성한 사전문진이 없습니다」로, 직원의 배지 문구와 뭉치지 않는다', () => {
    render(<QuestionnaireSection role="doctor" state={ready([])} />)
    expect(screen.getByText('작성한 사전문진이 없습니다')).toBeVisible()
  })

  test('[PTDET-QNR-03][A안] 직원에게 예약이 없으면 배지 대신 빈 안내만 보인다', () => {
    render(<QuestionnaireSection role="receptionist" state={READY_EMPTY} statuses={[]} onRequest={() => {}} />)
    expect(screen.getByText('예약이 없어 표시할 사전문진이 없습니다')).toBeVisible()
    expect(screen.queryByText('작성한 사전문진이 없습니다')).toBeNull()
  })
})
