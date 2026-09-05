import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BadAnswerInbox } from './BadAnswerInbox'
import type { Feedback, QualityApi } from '../../../api/qualityAdmin'

const items: Feedback[] = [
  { id: 'f1', source: 'realtime_report', question: '주차 되나요', botAnswer: '안 됩니다', correction: '지하 2층', hasSources: true, status: 'pending', createdAt: '2026-08-19T00:00:00Z' },
  { id: 'f2', source: 'quality_review', question: '주말 진료', botAnswer: '안 함', correction: '토요일 오전', hasSources: false, status: 'pending', createdAt: '2026-08-18T00:00:00Z' },
]
const mkApi = (o: Partial<QualityApi> = {}) =>
  ({
    listBadInbox: vi.fn().mockResolvedValue(items),
    getFeedback: vi.fn().mockResolvedValue(items[0]),
    applyFeedback: vi.fn().mockResolvedValue(undefined),
    rejectFeedback: vi.fn().mockResolvedValue(undefined),
    saveFeedbackCorrection: vi.fn().mockResolvedValue(undefined),
    ...o,
  }) as unknown as QualityApi

describe('BadAnswerInbox (BADINBOX-REVIEW-*)', () => {
  it("[BADINBOX-REVIEW-01] 실시간·품질 교정을 나란히 표시하고 quality_review는 '품질 리뷰'로 구분한다", async () => {
    render(<BadAnswerInbox api={mkApi()} />)
    const rows = await screen.findAllByTestId('inbox-row')
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.dataset.id === 'f2')).toHaveTextContent('품질 리뷰')
  })

  it('[BADINBOX-REVIEW-02] 상세는 출처·대상 질문·봇 답변·올바른 안내·근거를 보이고 없는 근거를 만들지 않는다', async () => {
    render(<BadAnswerInbox api={mkApi({ getFeedback: vi.fn().mockResolvedValue(items[1]) })} selectedId="f2" />)
    expect(await screen.findByText(/근거 자료 없음/)).toBeVisible()
    // pending 신고의 올바른 안내는 편집 가능한 교정 입력칸으로, 기존 교정문이 값으로 채워져 있다.
    expect(screen.getByLabelText('올바른 안내 교정')).toHaveValue('토요일 오전')
  })

  it('[BADINBOX-REVIEW-교정편집] pending 신고의 교정문을 직접 수정해 저장한다', async () => {
    const api = mkApi()
    render(<BadAnswerInbox api={api} selectedId="f1" />)
    const box = await screen.findByLabelText('올바른 안내 교정')
    expect(screen.getByRole('button', { name: '교정문 저장' })).toBeDisabled() // 안 고치면 저장 비활성
    fireEvent.change(box, { target: { value: '지하 2·3층 주차 가능' } })
    fireEvent.click(screen.getByRole('button', { name: '교정문 저장' }))
    await waitFor(() => expect(api.saveFeedbackCorrection).toHaveBeenCalledWith('f1', '지하 2·3층 주차 가능'))
    expect(api.applyFeedback).not.toHaveBeenCalled() // 저장은 반영이 아니다
    expect(await screen.findByText('저장됨')).toBeVisible()
  })

  it('[BADINBOX-REVIEW-교정편집] 교정문을 고친 채 [반영]하면 먼저 저장한 뒤 반영한다', async () => {
    const api = mkApi()
    const onApplyToKb = vi.fn()
    render(<BadAnswerInbox api={api} selectedId="f1" onApplyToKb={onApplyToKb} />)
    fireEvent.change(await screen.findByLabelText('올바른 안내 교정'), { target: { value: '지하 2층·정문 옆' } })
    fireEvent.click(screen.getByRole('button', { name: /반영/ }))
    await waitFor(() => expect(api.saveFeedbackCorrection).toHaveBeenCalledWith('f1', '지하 2층·정문 옆'))
    await waitFor(() => expect(api.applyFeedback).toHaveBeenCalledWith('f1'))
    expect(onApplyToKb).toHaveBeenCalledWith(expect.objectContaining({ correction: '지하 2층·정문 옆' }))
  })

  it('[BADINBOX-REVIEW-03] [반영]은 안내자료 수정·승인 흐름으로 연결하고 즉시 답변에 쓰지 않는다', async () => {
    const onApplyToKb = vi.fn()
    render(<BadAnswerInbox api={mkApi()} selectedId="f1" onApplyToKb={onApplyToKb} />)
    fireEvent.click(await screen.findByRole('button', { name: /반영/ }))
    expect(onApplyToKb).toHaveBeenCalledWith(expect.objectContaining({ feedbackId: 'f1', requiresApproval: true }))
  })

  it('[BADINBOX-REVIEW-04] 예시 추가는 확인이 끝난 교정만 참고 예시로 등록한다', async () => {
    const api = mkApi()
    render(<BadAnswerInbox api={api} selectedId="f1" addToExample />)
    fireEvent.click(await screen.findByRole('button', { name: /반영/ }))
    await waitFor(() => expect(api.applyFeedback).toHaveBeenCalledWith('f1'))
  })

  it('[다듬기] 처리함 탭에 status별 처리 건수 배지를 counts 한 번 조회로 표시한다(목록 3회 호출 대신)', async () => {
    // 목록 행의 상태 배지와 겹치지 않게 빈 목록으로 탭만 남긴다(배지는 목록과 무관하게 counts로 뜬다).
    const getFeedbackCounts = vi.fn().mockResolvedValue({ pending: 5, applied: 3, rejected: 1 })
    render(<BadAnswerInbox api={mkApi({ getFeedbackCounts, listBadInbox: vi.fn().mockResolvedValue([]) })} />)
    await waitFor(() => expect(getFeedbackCounts).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: /처리 전/ })).toHaveTextContent('5')
    expect(screen.getByRole('button', { name: /적용 완료/ })).toHaveTextContent('3')
    expect(screen.getByRole('button', { name: /기각 완료/ })).toHaveTextContent('1')
  })

  it('[BADINBOX-REVIEW-05] [반려]는 승인 자료·참고 예시를 바꾸지 않는다', async () => {
    const api = mkApi()
    render(<BadAnswerInbox api={api} selectedId="f1" />)
    fireEvent.click(await screen.findByRole('button', { name: /반려/ }))
    await waitFor(() => expect(api.rejectFeedback).toHaveBeenCalledWith('f1'))
    expect(api.applyFeedback).not.toHaveBeenCalled()
  })

  it('[BADINBOX-REVIEW-06] 처리 중에는 같은 신고의 중복 처리를 막는다', async () => {
    const api = mkApi({ applyFeedback: vi.fn(() => new Promise<void>(() => {})) })
    render(<BadAnswerInbox api={api} selectedId="f1" />)
    fireEvent.click(await screen.findByRole('button', { name: /반영/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /반영/ })).toBeDisabled())
    expect(screen.getByRole('button', { name: /반려/ })).toBeDisabled()
  })

  it('[BADINBOX-REVIEW-07] 처리 실패는 미처리 유지·오류·재시도이며 반영됐다고 표시하지 않는다', async () => {
    render(<BadAnswerInbox api={mkApi({ applyFeedback: vi.fn().mockRejectedValue(new Error('x')) })} selectedId="f1" />)
    fireEvent.click(await screen.findByRole('button', { name: /반영/ }))
    expect(await screen.findByText(/처리하지 못했습니다/)).toBeVisible()
    expect(screen.getByRole('button', { name: /다시 시도/ })).toBeVisible()
    expect(screen.queryByText(/반영 처리했습니다/)).toBeNull()
  })

  it('[BADINBOX-REVIEW-08] 처리 완료는 결과를 명확히 표시하고 목록 상태를 갱신한다', async () => {
    const api = mkApi()
    render(<BadAnswerInbox api={api} selectedId="f1" />)
    fireEvent.click(await screen.findByRole('button', { name: /반려/ }))
    expect(await screen.findByText(/반려 처리했습니다/)).toBeVisible()
    await waitFor(() => expect(api.listBadInbox).toHaveBeenCalledTimes(2)) // 목록 갱신
  })

  it('[BADINBOX-REVIEW-09] 동시 처리(다른 관리자 선처리)는 최신 상태를 보이고 성공으로 덮지 않는다', async () => {
    render(<BadAnswerInbox api={mkApi({ applyFeedback: vi.fn().mockRejectedValue(Object.assign(new Error('conflict'), { status: 409 })) })} selectedId="f1" />)
    fireEvent.click(await screen.findByRole('button', { name: /반영/ }))
    expect(await screen.findByText(/이미 다른 관리자가 처리했습니다/)).toBeVisible()
    expect(screen.queryByText(/반영 처리했습니다/)).toBeNull()
  })

  it("[BADINBOX-REVIEW-10] 조회 성공·0건은 '처리할 오답 신고가 없습니다'를 표시한다", async () => {
    render(<BadAnswerInbox api={mkApi({ listBadInbox: vi.fn().mockResolvedValue([]) })} />)
    expect(await screen.findByText('처리할 오답 신고가 없습니다')).toBeVisible()
  })

  it('[BADINBOX-REVIEW-11] 로딩 중에는 로딩을 표시하고 처리 버튼을 노출하지 않는다', () => {
    render(<BadAnswerInbox api={mkApi({ listBadInbox: vi.fn(() => new Promise<Feedback[]>(() => {})) })} />)
    expect(screen.getByLabelText('처리함 로딩')).toBeVisible()
    expect(screen.queryByRole('button', { name: /반영/ })).toBeNull()
  })

  it('[BADINBOX-REVIEW-12] 조회 실패는 오류·재시도이며 0건·근거 없음으로 바꾸지 않는다', async () => {
    render(<BadAnswerInbox api={mkApi({ listBadInbox: vi.fn().mockRejectedValue(new Error('x')) })} />)
    expect(await screen.findByText(/불러오지 못했습니다/)).toBeVisible()
    expect(screen.getByRole('button', { name: /다시 시도/ })).toBeVisible()
    expect(screen.queryByText('처리할 오답 신고가 없습니다')).toBeNull()
  })
})
