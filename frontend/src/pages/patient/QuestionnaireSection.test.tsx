import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { QuestionnaireSection, type QnrItem } from './QuestionnaireSection'
import type { SectionState } from './format'

function ready(items: QnrItem[]): SectionState<QnrItem[]> {
  return { loading: false, error: false, data: items, retry: () => {} }
}

const ITEM: QnrItem = {
  appointment_id: 'a1',
  visit_date: '2026-08-05',
  submitted_at: '2026-08-04T21:10:00',
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

  test('[PTDET-QNR-03][AD-050] 관리자에겐 응답 대신 열람 제한 안내만 보인다', () => {
    render(<QuestionnaireSection role="admin" state={ready([ITEM])} />)
    expect(screen.getByText('담당 의사만 열람할 수 있습니다')).toBeVisible()
    // 응답 내용은 그리지 않는다 — 화면 분기로도 답이 새지 않는다.
    expect(screen.queryByText('혈압약')).toBeNull()
    expect(screen.queryByRole('term', { name: '복용 중인 약' })).toBeNull()
  })

  test('[PTDET-QNR-04] 0건과 권한 제한을 같은 문구로 뭉치지 않고 내부 원인을 감춘다', () => {
    const { rerender } = render(<QuestionnaireSection role="doctor" state={ready([])} />)
    expect(screen.getByText('작성한 사전문진이 없습니다')).toBeVisible()

    rerender(<QuestionnaireSection role="receptionist" state={ready([])} />)
    expect(screen.queryByText('작성한 사전문진이 없습니다')).toBeNull()
    expect(screen.getByRole('button', { name: /담당 의사에게/ })).toBeVisible()
    expect(document.body).not.toHaveTextContent(/RLS|permission|policy/i)
  })
})
