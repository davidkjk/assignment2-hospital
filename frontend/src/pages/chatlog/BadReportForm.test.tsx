import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BadReportForm } from './BadReportForm'
import type { BadReportApi, TargetMessage } from '../../api/badReport'

const target: TargetMessage = { id: 'msg1', role: 'bot', content: '예약은 전화로만 가능합니다' }
const mkApi = (o: Partial<BadReportApi> = {}): BadReportApi => ({
  getTargetMessage: vi.fn().mockResolvedValue(target),
  reportBadAnswer: vi.fn().mockResolvedValue({ id: 'f1' }),
  ...o,
})

describe('BadReportForm (BADRPT-FORM-*)', () => {
  it('[BADRPT-FORM-TARGET-01] 선택한 봇 답변을 신고 대상으로 고정해 보여준다', async () => {
    render(<BadReportForm api={mkApi()} messageId="msg1" onDone={vi.fn()} onCancel={vi.fn()} />)
    expect(await screen.findByText(/예약은 전화로만 가능합니다/)).toBeVisible()
    expect(screen.getByTestId('bad-report-target').dataset.messageId).toBe('msg1')
  })

  it('[BADRPT-FORM-TARGET-02] 선택 메시지가 봇 답변이 아니면 저장하지 않는다', async () => {
    const api = mkApi({ getTargetMessage: vi.fn().mockResolvedValue({ id: 'msg2', role: 'user', content: '안녕' }) })
    render(<BadReportForm api={api} messageId="msg2" onDone={vi.fn()} onCancel={vi.fn()} />)
    await screen.findByText(/봇 답변만 신고할 수 있습니다/)
    expect(screen.queryByRole('button', { name: /저장/ })).toBeNull()
  })

  it('[BADRPT-FORM-EMPTY-01] 대상 ID가 없으면 빈 신고를 만들지 않고 상담 기록 복귀 경로를 준다', async () => {
    render(<BadReportForm api={mkApi()} messageId={null} onDone={vi.fn()} onCancel={vi.fn()} />)
    expect(await screen.findByText(/신고할 봇 답변이 없습니다/)).toBeVisible()
    expect(screen.getByRole('button', { name: /상담 기록으로/ })).toBeVisible()
  })

  it('[BADRPT-FORM-CORR-01] 올바른 안내를 작성할 수 있는 입력칸을 제공한다', async () => {
    render(<BadReportForm api={mkApi()} messageId="msg1" onDone={vi.fn()} onCancel={vi.fn()} />)
    expect(await screen.findByLabelText(/올바른 안내/)).toBeVisible()
  })

  it("[BADRPT-FORM-EXAMPLE-01] '향후 유사 질문 예시로도 사용' 체크박스를 둔다", async () => {
    render(<BadReportForm api={mkApi()} messageId="msg1" onDone={vi.fn()} onCancel={vi.fn()} />)
    expect(await screen.findByRole('checkbox', { name: /향후 유사 질문 예시로도 사용/ })).toBeVisible()
  })

  it('[BADRPT-FORM-SOURCE-01] 저장 시 source=realtime_report로 보내 품질 교정(quality_review)과 출처를 구분한다', async () => {
    const api = mkApi()
    render(<BadReportForm api={api} messageId="msg1" onDone={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.change(await screen.findByLabelText(/올바른 안내/), { target: { value: '예약은 앱에서도 됩니다' } })
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() => expect(api.reportBadAnswer).toHaveBeenCalled())
    expect((api.reportBadAnswer as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ messageId: 'msg1' })
    // source 문자열은 badReportApi가 realtime_report로 실어보낸다(Step 1에서 검증)
  })

  it('[BADRPT-FORM-VALID-01] 올바른 안내가 비어도 근거 없는 최소·최대 길이 차단을 만들지 않는다(확인 필요)', async () => {
    render(<BadReportForm api={mkApi()} messageId="msg1" onDone={vi.fn()} onCancel={vi.fn()} />)
    expect(await screen.findByRole('button', { name: /저장/ })).not.toBeDisabled()
  })

  it('[BADRPT-FORM-SAVE-01] 저장 중 입력·체크를 보존하고 저장 버튼 중복 클릭을 막는다', async () => {
    const api = mkApi({ reportBadAnswer: vi.fn(() => new Promise<{ id: string }>(() => {})) })
    render(<BadReportForm api={api} messageId="msg1" onDone={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.change(await screen.findByLabelText(/올바른 안내/), { target: { value: '교정문' } })
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /저장 중/ })).toBeDisabled())
    expect((screen.getByLabelText(/올바른 안내/) as HTMLTextAreaElement).value).toBe('교정문')
  })

  it('[BADRPT-FORM-SAVE-02] 저장 실패는 작성값을 보존하고 폼 안에 오류·재시도를 표시한다', async () => {
    const api = mkApi({ reportBadAnswer: vi.fn().mockRejectedValue(new Error('x')) })
    render(<BadReportForm api={api} messageId="msg1" onDone={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.change(await screen.findByLabelText(/올바른 안내/), { target: { value: '교정문' } })
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    expect(await screen.findByText(/저장하지 못했습니다/)).toBeVisible()
    expect(screen.getByRole('button', { name: /다시 시도/ })).toBeVisible()
    expect((screen.getByLabelText(/올바른 안내/) as HTMLTextAreaElement).value).toBe('교정문')
  })

  it("[BADRPT-FORM-SAVE-03] 저장 성공은 '아직 반영 아님'을 알리고 중복 제출을 막은 뒤 왔던 위치로 복귀한다(B2)", async () => {
    const onDone = vi.fn()
    render(<BadReportForm api={mkApi()} messageId="msg1" onDone={onDone} onCancel={vi.fn()} returnScroll={420} />)
    fireEvent.change(await screen.findByLabelText(/올바른 안내/), { target: { value: '교정문' } })
    fireEvent.click(screen.getByRole('button', { name: /저장/ }))
    expect(await screen.findByText(/아직 상담봇에 반영된 것은 아닙니다/)).toBeVisible()
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ scroll: 420 }))
    expect(screen.getByRole('button', { name: /저장/ })).toBeDisabled()
  })

  it('[BADRPT-FORM-LOAD-01] 대상 조회 중 로딩을 표시하고 다른 답변을 임의로 대입하지 않는다', () => {
    const api = mkApi({ getTargetMessage: vi.fn(() => new Promise<TargetMessage>(() => {})) })
    render(<BadReportForm api={api} messageId="msg1" onDone={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByLabelText('대상 답변 로딩')).toBeVisible()
    expect(screen.queryByTestId('bad-report-target')).toBeNull()
  })

  it('[BADRPT-FORM-ERR-01] 대상 조회 실패는 성공처럼 진행하지 않고 돌아가기·재시도를 준다', async () => {
    const api = mkApi({ getTargetMessage: vi.fn().mockRejectedValue(new Error('x')) })
    render(<BadReportForm api={api} messageId="msg1" onDone={vi.fn()} onCancel={vi.fn()} />)
    expect(await screen.findByText(/대상 답변을 불러오지 못했습니다/)).toBeVisible()
    expect(screen.getByRole('button', { name: /다시 시도/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^저장$/ })).toBeNull()
  })

  it('[BADRPT-FORM-LIVE-01] 작성 중 대상 대화 갱신에도 선택 메시지 ID를 유지한다(삭제·수정 계약 확인 필요)', async () => {
    const api = mkApi()
    const { rerender } = render(<BadReportForm api={api} messageId="msg1" onDone={vi.fn()} onCancel={vi.fn()} liveTick={0} />)
    await screen.findByTestId('bad-report-target')
    rerender(<BadReportForm api={api} messageId="msg1" onDone={vi.fn()} onCancel={vi.fn()} liveTick={1} />)
    expect(screen.getByTestId('bad-report-target').dataset.messageId).toBe('msg1')
    expect(api.getTargetMessage).toHaveBeenCalledTimes(1) // 라이브 신호로 다시 불러오지 않는다
  })

  it('[BADRPT-FORM-EXIT-01] 취소는 저장 없이 직전 필터·스크롤 위치로 복귀한다', async () => {
    const onCancel = vi.fn()
    const api = mkApi()
    render(<BadReportForm api={api} messageId="msg1" onDone={vi.fn()} onCancel={onCancel} returnScroll={420} />)
    fireEvent.click(await screen.findByRole('button', { name: /취소/ }))
    expect(onCancel).toHaveBeenCalledWith({ scroll: 420 })
    expect(api.reportBadAnswer).not.toHaveBeenCalled()
  })
})
