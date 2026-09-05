import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { RecordPanel, insertAtCursor, type RecordPanelProps } from './RecordPanel'
import { emptyFields } from './useDraftStore'

// jsdom엔 scrollIntoView가 없다 — InlineError가 자리로 스크롤하려다 죽지 않게 스텁한다.
Element.prototype.scrollIntoView = vi.fn()

// [DOCTOR-RECORD-01~10] 진료기록 작성·완료·수정. ⭐ 남의 글이 내 진단으로 남지 않게 — 커서 삽입은
//   덮어쓰지 않고, 완료는 확인 팝업을 거치며, 충돌·오프라인은 성공한 척하지 않고 입력을 지키지 않는다.

function renderRecord(over: Partial<RecordPanelProps> = {}) {
  const props: RecordPanelProps = {
    fields: emptyFields(),
    onFieldsChange: vi.fn(),
    mode: 'live',
    completed: false,
    draftStatus: 'idle',
    draftSavedAt: null,
    draftError: null,
    onRetryDraft: vi.fn(),
    onComplete: vi.fn().mockResolvedValue(undefined),
    onRevise: vi.fn().mockResolvedValue(undefined),
    onActiveFieldChange: vi.fn(),
    ...over,
  }
  render(<RecordPanel {...props} />)
  return props
}

const symptomInput = () => screen.getByLabelText('증상')
const diagnosisInput = () => screen.getByLabelText('진단')
const publicInput = () => screen.getByLabelText('환자 공개용 안내문')

describe('RecordPanel', () => {
  test('[DOCTOR-RECORD-01] 작성 칸은 증상·진단·처치·환자 공개용 안내문 순서다', () => {
    renderRecord()
    const labels = screen.getAllByRole('textbox').map((el) => el.getAttribute('aria-label'))
    expect(labels).toEqual(['증상', '진단', '처치', '환자 공개용 안내문'])
  })

  test('[DOCTOR-RECORD-02] 공개용 안내문은 내부 기록과 다른 영역으로 분리되고 안내가 붙는다', () => {
    renderRecord()
    expect(screen.getByText('이 칸만 환자 앱에 보입니다')).toBeVisible()
    expect(publicInput().closest('fieldset')).not.toBe(symptomInput().closest('fieldset'))
  })

  test('[DOCTOR-RECORD-03][DOCTOR-PHRASE-02] insertAtCursor는 덮어쓰지 않고 커서 자리에 끼운다', () => {
    // "기존 내용 "(끝 커서=6) → "상기도 감염" 삽입 → "기존 내용 상기도 감염"
    expect(insertAtCursor('기존 내용 ', 6, '상기도 감염')).toBe('기존 내용 상기도 감염')
    expect(insertAtCursor('ab', 1, 'X')).toBe('aXb') // 가운데에 끼운다
  })

  test('[DOCTOR-RECORD-06][DOCTOR-RECORD-07] [진료 완료]는 확인 팝업을 거치고, 확인 전엔 완료가 안 간다', async () => {
    const user = userEvent.setup()
    const props = renderRecord()
    await user.click(screen.getByRole('button', { name: '진료 완료' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('완료 후에는 사유 입력 없이 수정할 수 없습니다')
    expect(props.onComplete).not.toHaveBeenCalled() // 아직 상태를 바꾸지 않는다
  })

  test('[DOCTOR-RECORD-07] 확인 팝업의 [확인]을 눌러야 완료가 간다', async () => {
    const user = userEvent.setup()
    const props = renderRecord()
    await user.click(screen.getByRole('button', { name: '진료 완료' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '확인' }))
    expect(props.onComplete).toHaveBeenCalledTimes(1)
  })

  test('[DOCTOR-RECORD-09] 충돌이면 성공한 척하지 않고 입력을 지키며 안내한다', () => {
    renderRecord({
      fields: { ...emptyFields(), diagnosis: '급성 기관지염' },
      conflictMessage: '다른 사람이 먼저 수정했습니다. 새로고침 후 다시 시도하세요',
    })
    expect(screen.getByText('다른 사람이 먼저 수정했습니다. 새로고침 후 다시 시도하세요')).toBeVisible()
    expect(diagnosisInput()).toHaveValue('급성 기관지염') // 쓴 것은 그대로다
    expect(screen.queryByText(/저장되었습니다/)).toBeNull()
  })

  test('[DOCTOR-RECORD-05] 자동저장 실패 안내는 작성란 「위」에 붙고 [다시 시도]를 준다', () => {
    renderRecord({ draftError: '연결이 끊겨 저장할 수 없습니다' })
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('연결이 끊겨 저장할 수 없습니다')
    // 작성란보다 문서상 앞(위)에 있어야 한다
    expect(alert.compareDocumentPosition(symptomInput()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(alert).getByRole('button', { name: '다시 시도' })).toBeVisible()
  })

  test('[DOCTOR-LOAD-03][BTN-STATE-03] 오프라인이면 완료 버튼이 잠기고 이유가 붙되 입력은 안 지운다', () => {
    renderRecord({ fields: { ...emptyFields(), symptoms: '기침 3일째' }, offline: true, lastSyncedAt: '09:41' })
    expect(screen.getByRole('button', { name: /진료 완료/ })).toBeDisabled()
    expect(screen.getByText(/연결이 끊겨 저장할 수 없습니다/)).toBeVisible()
    expect(symptomInput()).toHaveValue('기침 3일째')
  })

  test('[DOCTOR-RECORD-04] 저장 상태를 「임시저장됨」으로만 알린다', () => {
    renderRecord({ draftStatus: 'saved', draftSavedAt: new Date('2026-08-15T14:32:00+09:00') })
    expect(screen.getByText('임시저장됨 · 14:32')).toBeVisible()
  })

  test('[DOCTOR-RECORD-08][DOCTOR-RECORD-10] 완료 후 수정은 이전 내용을 지우지 않고 펼쳐 본다', async () => {
    const user = userEvent.setup()
    renderRecord({
      completed: true,
      mode: 'read_only_editable',
      fields: { ...emptyFields(), symptoms: '급성 기관지염(수정본)' },
      revisions: [
        { symptoms: '기침 3일째', diagnosis: '', treatment: '', patient_visible_notes: '', revised_at: '2026-08-15T14:00', revised_by: '박지훈', reason: '오타 수정' },
      ],
    })
    expect(screen.queryByText(/기침 3일째/)).toBeNull() // 최신만 기본으로
    await user.click(screen.getByRole('button', { name: '이전 내용 보기' }))
    expect(screen.getByText(/기침 3일째/)).toBeVisible()
  })

  test('[DOCTOR-RECORD-08] 완료 기록 수정은 사유가 필수다', async () => {
    const user = userEvent.setup()
    const props = renderRecord({ completed: true, mode: 'read_only_editable', fields: { ...emptyFields(), symptoms: '급성 기관지염' } })
    await user.click(screen.getByRole('button', { name: '수정' }))
    // 사유가 비면 저장이 잠긴다
    await user.click(screen.getByRole('button', { name: '수정 저장' }))
    expect(props.onRevise).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('수정 사유'), '오타 수정')
    await user.click(screen.getByRole('button', { name: '수정 저장' }))
    expect(props.onRevise).toHaveBeenCalledWith('오타 수정')
  })

  test('[DOCTOR-DATE-05] 과거 미완료는 재개해 완료시키지 않고 오늘로 안내한다', () => {
    renderRecord({ mode: 'read_only', pastIncomplete: true })
    expect(screen.queryByRole('button', { name: '진료 완료' })).toBeNull()
    expect(screen.getByText(/오늘 「지금 처리할 것」에서 이어서/)).toBeVisible()
  })
})
