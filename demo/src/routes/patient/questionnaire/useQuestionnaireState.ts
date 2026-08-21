import { useCallback, useMemo, useState } from 'react'
import {
  questionnaireQuestions,
  type QuestionnaireQuestion,
  type QuestionnaireQuestionType,
} from './mockData'

export type AnswerValue = string | string[]
export type AnswerMap = Record<string, AnswerValue>
export type QuestionnairePhase = 'questions' | 'review' | 'submitted'

function hasOwnAnswer(answers: AnswerMap, questionId: string): boolean {
  return Object.prototype.hasOwnProperty.call(answers, questionId)
}

function hasMeaningfulAnswer(value: AnswerValue | undefined): boolean {
  if (Array.isArray(value)) return value.length > 0
  return typeof value === 'string' && value.trim().length > 0
}

function emptyAnswer(type: QuestionnaireQuestionType): AnswerValue {
  return type === 'multiple' ? [] : ''
}

function firstUnansweredIndex(questions: readonly QuestionnaireQuestion[], answers: AnswerMap): number {
  const index = questions.findIndex((question) => !hasOwnAnswer(answers, question.id))
  return index === -1 ? Math.max(questions.length - 1, 0) : index
}

/**
 * 사전문진의 데모 상태 훅.
 * 답변은 입력 즉시 answers에 반영되고, 다음 버튼은 선택 사항을 지나간 것으로 저장한다.
 */
export function useQuestionnaireState(
  questions: readonly QuestionnaireQuestion[] = questionnaireQuestions,
  initialAnswers: AnswerMap = {},
  initialPhase: QuestionnairePhase = 'questions',
) {
  const [answers, setAnswers] = useState<AnswerMap>(() => ({ ...initialAnswers }))
  const [currentIndex, setCurrentIndex] = useState(() =>
    initialPhase === 'review'
      ? Math.max(questions.length - 1, 0)
      : firstUnansweredIndex(questions, initialAnswers),
  )
  const [phase, setPhase] = useState<QuestionnairePhase>(initialPhase)
  // 리뷰(확인 화면)에서 [수정]으로 특정 문항에 왔는지. true면 저장 후 순차 진행이 아니라
  // 확인 화면으로 바로 복귀한다(정본 NAV-QNR-14: 1번부터 다시 훑지 않는다).
  const [returnToReview, setReturnToReview] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentQuestion = questions[currentIndex]

  const progress = useMemo(
    () => questions.filter((question) => hasOwnAnswer(answers, question.id)).length,
    [answers, questions],
  )

  const isComplete = useMemo(
    () => questions.every((question) => hasOwnAnswer(answers, question.id)),
    [answers, questions],
  )

  const answer = useCallback((questionId: string, value: AnswerValue) => {
    setAnswers((previous) => ({
      ...previous,
      [questionId]: Array.isArray(value) ? [...value] : value,
    }))
    setError(null)
  }, [])

  const next = useCallback(() => {
    if (!currentQuestion) {
      setPhase('review')
      return true
    }

    const value = answers[currentQuestion.id]
    const answered = hasOwnAnswer(answers, currentQuestion.id)
    if (currentQuestion.required && !hasMeaningfulAnswer(value)) {
      setError('필수 문항에 답해 주세요.')
      return false
    }

    if (!answered) {
      answer(currentQuestion.id, emptyAnswer(currentQuestion.type))
    } else {
      setError(null)
    }

    // 리뷰에서 [수정]으로 온 문항이면, 저장 후 순차 진행하지 않고 확인 화면으로 복귀한다.
    if (returnToReview) {
      setReturnToReview(false)
      setPhase('review')
      return true
    }

    if (currentIndex >= questions.length - 1) {
      setPhase('review')
    } else {
      setCurrentIndex((index) => Math.min(index + 1, questions.length - 1))
    }
    return true
  }, [answer, answers, currentIndex, currentQuestion, questions.length, returnToReview])

  const back = useCallback(() => {
    setError(null)
    if (phase === 'review') {
      setPhase('questions')
      setCurrentIndex(Math.max(questions.length - 1, 0))
      return
    }
    if (phase === 'submitted') return
    setCurrentIndex((index) => Math.max(index - 1, 0))
  }, [phase, questions.length])

  const goTo = useCallback(
    (index: number) => {
      if (phase !== 'questions' && phase !== 'review') return
      // 확인 화면에서 [수정]으로 진입한 것이면, 그 문항 저장 후 확인 화면으로 돌아가도록 표시.
      if (phase === 'review') setReturnToReview(true)
      setCurrentIndex(Math.min(Math.max(index, 0), Math.max(questions.length - 1, 0)))
      setPhase('questions')
      setError(null)
    },
    [phase, questions.length],
  )

  const submit = useCallback(() => {
    if (!isComplete) return false
    setPhase('submitted')
    return true
  }, [isComplete])

  return {
    answers,
    answer,
    back,
    canSubmit: isComplete,
    currentIndex,
    currentQuestion,
    error,
    goTo,
    isComplete,
    isReview: phase === 'review',
    isSubmitted: phase === 'submitted',
    next,
    phase,
    progress,
    questionIndex: currentIndex,
    returnToReview,
    submit,
    total: questions.length,
  }
}
