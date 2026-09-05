import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PatientSupportSection } from './PatientSupportSection'
import type { PatientSupportApi, PatientTicket } from '../../api/patientSupport'

const ticket = (over: Partial<PatientTicket> = {}): PatientTicket => ({
  id: 't1', patientId: 'p1', question: '약 정보', status: 'pending', createdAt: '2026-08-19T00:00:00Z', ...over,
})
const api = (impl: PatientSupportApi['listPatientTickets']): PatientSupportApi => ({ listPatientTickets: impl })

describe('PatientSupportSection', () => {
  it('[PTSUP-SECT-LINK-01] 카드 내용·상태는 PTDET-SUPPORT를 그대로 소비한다(재정의 안 함)', async () => {
    render(<PatientSupportSection patientId="p1" api={api(async () => [ticket()])} onOpenTicket={vi.fn()} />)
    expect(await screen.findByText('약 정보')).toBeVisible()
    expect(screen.getByText('새 문의')).toBeVisible() // pending → PTDET-SUPPORT-02 번역
  })

  it('[PTSUP-SECT-EMPTY-01] 0건은 PTDET-SUPPORT-05 문구를 쓴다', async () => {
    render(<PatientSupportSection patientId="p1" api={api(async () => [])} onOpenTicket={vi.fn()} />)
    expect(await screen.findByText('직원에게 전달된 상담 문의가 없습니다')).toBeVisible()
  })

  it('[PTSUP-SECT-LOAD-01] 섹션 로딩은 이 섹션만 로딩이고 다른 상세를 지우지 않는다', async () => {
    let resolve!: (v: PatientTicket[]) => void
    render(
      <PatientSupportSection
        patientId="p1"
        api={api(() => new Promise((r) => (resolve = r)))}
        onOpenTicket={vi.fn()}
        sibling={<div>진료 기록</div>}
      />,
    )
    expect(screen.getByText('진료 기록')).toBeVisible()
    expect(screen.getByLabelText('상담 문의 로딩')).toBeVisible()
    await act(async () => resolve([]))
  })

  it('[PTSUP-SECT-ERR-01] 섹션 오류는 이 섹션에만 실패·재시도를 표시한다', async () => {
    render(
      <PatientSupportSection
        patientId="p1"
        api={api(async () => { throw new Error('x') })}
        onOpenTicket={vi.fn()}
        sibling={<div>진료 기록</div>}
      />,
    )
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeVisible()
    expect(screen.getByText('진료 기록')).toBeVisible()
  })

  it('[PTSUP-SECT-ORDER-01] 최신 생성 시각 위·동점은 티켓 ID를 마지막 키로 정렬한다', async () => {
    const list = [
      ticket({ id: 'b', createdAt: '2026-08-19T00:00:00Z' }),
      ticket({ id: 'a', createdAt: '2026-08-19T00:00:00Z' }),
      ticket({ id: 'c', question: '최신', createdAt: '2026-08-20T00:00:00Z' }),
    ]
    render(<PatientSupportSection patientId="p1" api={api(async () => list)} onOpenTicket={vi.fn()} />)
    const cards = await screen.findAllByTestId('ptsup-card')
    expect(cards[0].textContent).toContain('최신') // 최신 생성 시각 위
    expect(cards[1].getAttribute('data-ticket')).toBe('b') // 동점 → id desc(canonical PTDET-SUPPORT-03)
  })

  it('[PTSUP-SECT-BLOCK-01] Task 2 마이그레이션·정렬이 있으므로 가짜 카드가 아니라 실제 조회를 소비한다', async () => {
    const impl = vi.fn(async () => [ticket()])
    render(<PatientSupportSection patientId="p1" api={api(impl)} onOpenTicket={vi.fn()} />)
    await waitFor(() => expect(impl).toHaveBeenCalledWith('p1')) // patient-scoped 실제 조회
  })

  it('[PTSUP-SECT-LIVE-01] Realtime 구독은 근거가 없어 unknown이며 티켓함과 같다고 추측하지 않는다', async () => {
    const { container } = render(<PatientSupportSection patientId="p1" api={api(async () => [ticket()])} onOpenTicket={vi.fn()} />)
    await screen.findByText('약 정보')
    expect(container.querySelector("[data-live='unknown']")).toBeTruthy()
  })

  it('[PTSUP-SECT-LIVE-02] 새로고침·재진입은 현재 환자 범위로 다시 조회한다', async () => {
    const impl = vi.fn(async () => [ticket()])
    render(<PatientSupportSection patientId="p1" api={api(impl)} onOpenTicket={vi.fn()} />)
    await screen.findByText('약 정보')
    await userEvent.click(screen.getByRole('button', { name: '새로고침' }))
    expect(impl).toHaveBeenLastCalledWith('p1')
  })

  it('[PTSUP-SECT-NAV-01] 카드 선택은 티켓·대화 상세를 별도 전체 화면으로 연다', async () => {
    const onOpenTicket = vi.fn()
    render(<PatientSupportSection patientId="p1" api={api(async () => [ticket()])} onOpenTicket={onOpenTicket} />)
    await userEvent.click(await screen.findByText('약 정보'))
    expect(onOpenTicket).toHaveBeenCalledWith({ ticketId: 't1', fullscreen: true })
  })

  it('[PTSUP-SECT-PRIV-01] 현재 환자 티켓만 표시하고 다른 환자 문의를 섞지 않는다', async () => {
    render(
      <PatientSupportSection
        patientId="p1"
        api={api(async () => [ticket({ patientId: 'p1' }), ticket({ id: 't2', patientId: 'p2', question: '남의 것' })])}
        onOpenTicket={vi.fn()}
      />,
    )
    await screen.findByText('약 정보')
    expect(screen.queryByText('남의 것')).toBeNull() // patient_id 불일치 방어
  })

  it('[PTSUP-SECT-EXC-01] 환자가 바뀌면 이전 환자 결과를 남기지 않고 새 범위로 재조회한다', async () => {
    const impl = vi.fn(async (id: string) => [ticket({ id, patientId: id, question: `${id} 문의` })])
    const { rerender } = render(<PatientSupportSection patientId="p1" api={api(impl)} onOpenTicket={vi.fn()} />)
    await screen.findByText('p1 문의')
    rerender(<PatientSupportSection patientId="p2" api={api(impl)} onOpenTicket={vi.fn()} />)
    await screen.findByText('p2 문의')
    expect(screen.queryByText('p1 문의')).toBeNull() // 이전 환자 결과 안 남김
  })
})
