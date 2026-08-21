import { act, renderHook } from '@testing-library/react'
import type { QuestionnaireQuestion } from './mockData'
import { useQuestionnaireState } from './useQuestionnaireState'

const questions: QuestionnaireQuestion[] = [
  { id: 'required', text: '필수 문항', type: 'text', required: true },
  { id: 'optional', text: '선택 문항', type: 'single', options: ['선택'] },
]

test('필수 미답은 다음으로 넘어가지 않고, 답변하면 진행률이 오른다', () => {
  const { result } = renderHook(() => useQuestionnaireState(questions))

  act(() => result.current.next())
  expect(result.current.currentIndex).toBe(0)
  expect(result.current.progress).toBe(0)
  expect(result.current.error).toBe('필수 문항에 답해 주세요.')

  act(() => result.current.answer('required', '복통이 있어요'))
  expect(result.current.progress).toBe(1)

  act(() => result.current.next())
  expect(result.current.currentIndex).toBe(1)
})

test('선택 문항을 비워 넘기면 최종 확인에서 답 없음으로 남는다', () => {
  const { result } = renderHook(() => useQuestionnaireState(questions, { required: '저장된 답' }))

  expect(result.current.currentIndex).toBe(1)
  expect(result.current.progress).toBe(1)

  act(() => result.current.next())
  expect(result.current.isReview).toBe(true)
  expect(result.current.isComplete).toBe(true)
  expect(result.current.answers.optional).toEqual('')

  act(() => result.current.submit())
  expect(result.current.isSubmitted).toBe(true)
})
