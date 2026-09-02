import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KbList } from './KbList'
import type { KbDoc } from '../../../api/kbAdmin'

const doc = (over: Partial<KbDoc> = {}): KbDoc => ({
  id: 'd1',
  title: '주차 안내',
  category: '위치·주차',
  status: 'approved',
  isRestricted: false,
  hasPendingEdit: false,
  ...over,
})

describe('KbList', () => {
  it('[KBADM-LIST-01] 안내자료를 목록으로 표시하고 분류·상태 필터를 제공한다', () => {
    render(<KbList docs={[doc()]} phase="ready" filters={{}} onFilter={vi.fn()} onOpen={vi.fn()} />)
    expect(screen.getByText('주차 안내')).toBeVisible()
    expect(screen.getByLabelText('분류')).toBeInTheDocument()
    expect(screen.getByLabelText('상태')).toBeInTheDocument()
  })

  it('[KBADM-LIST-02] 분류에 진료과·의사 소개, 진료시간·휴진일을 KB 분류로 넣지 않는다', () => {
    render(<KbList docs={[doc()]} phase="ready" filters={{}} onFilter={vi.fn()} onOpen={vi.fn()} />)
    const options = Array.from(screen.getByLabelText('분류').querySelectorAll('option')).map((o) => o.textContent)
    expect(options).not.toContain('진료과·의사 소개')
    expect(options).not.toContain('진료시간·휴진일')
  })

  it('[KBADM-LIST-03] 상태 필터를 바꾸면 그 상태만 재조회하되 enum·정렬을 발명하지 않는다', async () => {
    const onFilter = vi.fn()
    render(<KbList docs={[doc()]} phase="ready" filters={{}} onFilter={onFilter} onOpen={vi.fn()} statusContract="unknown" />)
    await userEvent.selectOptions(screen.getByLabelText('상태'), 'draft')
    expect(onFilter).toHaveBeenCalledWith({ status: 'draft' })
    expect(screen.getByTestId('kb-list').dataset.statusContract).toBe('unknown')
  })

  it('[KBADM-LIST-04] 승인된 자료를 구분 표시하고 미승인 저장본을 근거처럼 보이지 않는다', () => {
    render(
      <KbList
        docs={[doc({ status: 'approved' }), doc({ id: 'd2', status: 'draft', title: '임시본' })]}
        phase="ready"
        filters={{}}
        onFilter={vi.fn()}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByText('주차 안내').closest('[data-doc]')!.textContent).toMatch(/승인됨/)
    expect(screen.getByText('임시본').closest('[data-doc]')!.textContent).not.toMatch(/답변 근거/)
  })

  it('[KBADM-LIST-05] is_restricted 자료는 \'답하면 안 되는 내용\'으로 구분한다', () => {
    render(<KbList docs={[doc({ isRestricted: true })]} phase="ready" filters={{}} onFilter={vi.fn()} onOpen={vi.fn()} />)
    expect(screen.getByText(/답하면 안 되는 내용/)).toBeVisible()
  })

  it('[KBADM-LIST-06] 0건은 \'조건에 맞는 안내자료가 없습니다\'이며 조회 실패를 대체하지 않는다', () => {
    render(<KbList docs={[]} phase="empty" filters={{ category: '주차' }} onFilter={vi.fn()} onOpen={vi.fn()} />)
    expect(screen.getByText('조건에 맞는 안내자료가 없습니다')).toBeVisible()
    expect(screen.queryByText(/불러오지 못했/)).toBeNull()
  })

  it('[KBADM-LIST-07] 로딩은 이전 조건을 유지하고 이전 결과를 새 조건 결과로 가장하지 않는다', () => {
    render(<KbList docs={[doc()]} phase="loading" filters={{ category: '주차' }} onFilter={vi.fn()} onOpen={vi.fn()} />)
    expect(screen.getByLabelText('목록 로딩')).toBeVisible()
    expect(screen.getByLabelText('분류')).toHaveValue('주차')
  })

  it('[KBADM-LIST-08] 오류는 \'안내자료를 불러오지 못했습니다\'+[다시 시도]이며 0건으로 표시하지 않는다', () => {
    render(<KbList docs={[]} phase="error" filters={{}} onFilter={vi.fn()} onOpen={vi.fn()} />)
    expect(screen.getByText('안내자료를 불러오지 못했습니다')).toBeVisible()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeVisible()
    expect(screen.queryByText('조건에 맞는 안내자료가 없습니다')).toBeNull()
  })

  it('[KBADM-LIST-09] 행 선택은 편집 상세를 열고 복귀 시 직전 필터·스크롤을 복원한다', async () => {
    const onOpen = vi.fn()
    render(<KbList docs={[doc()]} phase="ready" filters={{ category: '주차' }} onFilter={vi.fn()} onOpen={onOpen} />)
    await userEvent.click(screen.getByText('주차 안내'))
    expect(onOpen).toHaveBeenCalledWith({ id: 'd1', fullscreen: true, restore: { category: '주차' } })
  })
})
