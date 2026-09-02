import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ExampleBank } from './ExampleBank'
import type { Example, QualityApi } from '../../../api/qualityAdmin'

const examples: Example[] = [
  { id: 'e1', question: '주차 되나요', answer: '지하 2층', active: true },
  { id: 'e2', question: '주말 진료', answer: '토요일 오전', active: true },
]
const mkApi = (o: Partial<QualityApi> = {}) =>
  ({
    listExamples: vi.fn().mockResolvedValue(examples),
    deactivateExample: vi.fn().mockResolvedValue(undefined),
    ...o,
  }) as unknown as QualityApi

describe('ExampleBank (QAEX-LIST-*)', () => {
  it('[QAEX-LIST-01] 승인된 교정 참고 예시를 목록으로 보여준다', async () => {
    const api = mkApi()
    render(<ExampleBank api={api} />)
    expect(await screen.findAllByTestId('example-row')).toHaveLength(2)
    expect(api.listExamples).toHaveBeenCalledWith(true)
  })

  it('[QAEX-LIST-02] 원 질문과 교정 답변을 함께 표시한다', async () => {
    render(<ExampleBank api={mkApi()} />)
    const row = (await screen.findAllByTestId('example-row'))[0]
    expect(row).toHaveTextContent('주차 되나요')
    expect(row).toHaveTextContent('지하 2층')
  })

  it('[QAEX-LIST-03] 비활성화는 삭제가 아니라 참고하지 않는 비활성 상태로 바꾼다', async () => {
    const api = mkApi()
    render(<ExampleBank api={api} />)
    fireEvent.click((await screen.findAllByRole('button', { name: /비활성화/ }))[0])
    await waitFor(() => expect(api.deactivateExample).toHaveBeenCalledWith('e1'))
    expect(screen.queryByRole('button', { name: /삭제/ })).toBeNull()
  })

  it('[QAEX-LIST-04] 비활성화 진행 중에는 해당 예시의 중복 조작을 막는다', async () => {
    const api = mkApi({ deactivateExample: vi.fn(() => new Promise<void>(() => {})) })
    render(<ExampleBank api={api} />)
    fireEvent.click((await screen.findAllByRole('button', { name: /비활성화/ }))[0])
    await waitFor(() => expect((screen.getAllByTestId('example-row')[0].querySelector('button') as HTMLButtonElement).disabled).toBe(true))
  })

  it('[QAEX-LIST-05] 비활성화 실패는 예시를 활성 유지하고 오류·재시도를 표시한다', async () => {
    render(<ExampleBank api={mkApi({ deactivateExample: vi.fn().mockRejectedValue(new Error('x')) })} />)
    fireEvent.click((await screen.findAllByRole('button', { name: /비활성화/ }))[0])
    expect(await screen.findByText(/처리하지 못했습니다/)).toBeVisible()
    expect(screen.getByRole('button', { name: /다시 시도/ })).toBeVisible()
    expect(screen.getAllByTestId('example-row')[0].dataset.active).toBe('true')
  })

  it('[QAEX-LIST-06] 비활성화 성공은 비활성 상태를 반영하고 삭제됐다고 표현하지 않는다', async () => {
    render(<ExampleBank api={mkApi()} />)
    fireEvent.click((await screen.findAllByRole('button', { name: /비활성화/ }))[0])
    expect(await screen.findByText(/비활성 처리했습니다/)).toBeVisible()
    expect(screen.queryByText(/삭제했습니다/)).toBeNull()
    expect(screen.getAllByTestId('example-row')[0].dataset.active).toBe('false')
  })

  it('[QAEX-LIST-07] 동시 변경(다른 관리자 선처리)은 최신 상태를 다시 조회하고 성공으로 가장하지 않는다', async () => {
    render(<ExampleBank api={mkApi({ deactivateExample: vi.fn().mockRejectedValue(Object.assign(new Error('conflict'), { status: 409 })) })} />)
    fireEvent.click((await screen.findAllByRole('button', { name: /비활성화/ }))[0])
    expect(await screen.findByText(/이미 다른 관리자가 변경했습니다/)).toBeVisible()
    expect(screen.queryByText(/비활성 처리했습니다/)).toBeNull()
  })

  it("[QAEX-LIST-08] 조회 성공·0건은 '등록된 참고 예시가 없습니다'를 표시한다", async () => {
    render(<ExampleBank api={mkApi({ listExamples: vi.fn().mockResolvedValue([]) })} />)
    expect(await screen.findByText('등록된 참고 예시가 없습니다')).toBeVisible()
  })

  it('[QAEX-LIST-09] 목록 조회 중에는 예시 영역에 로딩을 표시한다', () => {
    render(<ExampleBank api={mkApi({ listExamples: vi.fn(() => new Promise<Example[]>(() => {})) })} />)
    expect(screen.getByLabelText('예시 로딩')).toBeVisible()
  })

  it('[QAEX-LIST-10] 목록 조회 실패는 오류·재시도이며 0건으로 표시하지 않는다', async () => {
    render(<ExampleBank api={mkApi({ listExamples: vi.fn().mockRejectedValue(new Error('x')) })} />)
    expect(await screen.findByText(/불러오지 못했습니다/)).toBeVisible()
    expect(screen.getByRole('button', { name: /다시 시도/ })).toBeVisible()
    expect(screen.queryByText('등록된 참고 예시가 없습니다')).toBeNull()
  })
})
