import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { NoteSection } from './NoteSection'
import type { PatientNote } from '../../api/patients'
import type { SectionState } from './format'

function state(over: Partial<SectionState<PatientNote[]>> = {}): SectionState<PatientNote[]> {
  return { loading: false, error: false, data: [], retry: () => {}, ...over }
}

const NOTE: PatientNote = { id: 'n1', content: '보호자와 통화함', staff_name: '김수진', created_at: '2026-08-16T14:32:00' }

describe('NoteSection', () => {
  test('[PTDET-NOTE-01] 내용·작성 직원·시각을 남기고 공개 영역과 분리한다', () => {
    render(<NoteSection state={state({ data: [NOTE] })} onAdd={vi.fn()} />)
    const row = within(screen.getByLabelText('내부 메모'))
    expect(row.getByText('보호자와 통화함')).toBeVisible()
    expect(row.getByText('김수진')).toBeVisible()
    expect(row.getByText('8/16 14:32')).toBeVisible()
    expect(screen.getByLabelText('내부 메모').dataset.visibility).toBe('staff-only')
  })

  test('[PTDET-NOTE-03][BTN-BUSY-01] 저장 중 라벨이 바뀌고 두 번 눌러도 한 번만 간다', async () => {
    const user = userEvent.setup()
    let resolve!: () => void
    const onAdd = vi.fn(() => new Promise<void>((r) => { resolve = r }))
    render(<NoteSection state={state()} onAdd={onAdd} />)

    await user.click(screen.getByRole('button', { name: '내부 메모 추가' }))
    await user.type(screen.getByLabelText('내부 메모 내용'), '보호자와 통화함')
    const save = screen.getByRole('button', { name: '저장' })
    await user.dblClick(save)

    expect(screen.getByRole('button', { name: '◌ 저장 중…' })).toBeVisible()
    expect(onAdd).toHaveBeenCalledOnce()
    resolve()
  })

  test('[PTDET-NOTE-04] 메모 수정·삭제 버튼을 두지 않는다', () => {
    render(<NoteSection state={state({ data: [NOTE] })} onAdd={vi.fn()} />)
    const sect = within(screen.getByLabelText('내부 메모'))
    expect(sect.queryByRole('button', { name: /수정|삭제/ })).toBeNull()
    expect(sect.getAllByRole('button').map((b) => b.textContent)).toEqual(['내부 메모 추가'])
  })

  test('[PTDET-NOTE-05] 0건엔 [다시 시도] 없이 추가 버튼만, 조회 실패일 때만 [다시 시도]', () => {
    const { rerender } = render(<NoteSection state={state({ data: [] })} onAdd={vi.fn()} />)
    expect(screen.getByText('아직 남겨진 내부 메모가 없습니다')).toBeVisible()
    expect(screen.getByRole('button', { name: '내부 메모 추가' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()

    rerender(<NoteSection state={state({ error: true, data: undefined })} onAdd={vi.fn()} />)
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeVisible()
  })

  test('[PTDET-NOTE-02] 저장에 성공하면 입력이 닫히고 새 메모가 목록에 보인다', async () => {
    const user = userEvent.setup()
    // onAdd 성공 후 부모가 목록을 갱신하는 것을 흉내낸다.
    let notes: PatientNote[] = []
    const onAdd = vi.fn(async (content: string) => {
      notes = [{ id: 'n2', content, staff_name: '김수진', created_at: '2026-08-16T15:00:00' }]
    })
    const { rerender } = render(<NoteSection state={state({ data: notes })} onAdd={onAdd} />)
    await user.click(screen.getByRole('button', { name: '내부 메모 추가' }))
    await user.type(screen.getByLabelText('내부 메모 내용'), '처방 변경 설명함')
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('처방 변경 설명함'))

    rerender(<NoteSection state={state({ data: notes })} onAdd={onAdd} />)
    expect(screen.getByText('처방 변경 설명함')).toBeVisible()
    expect(screen.queryByLabelText('내부 메모 내용')).toBeNull() // 입력이 닫힌다
  })
})
