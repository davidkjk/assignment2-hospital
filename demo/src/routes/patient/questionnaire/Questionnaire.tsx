import { useMemo } from 'react'
import { CheckCircle2, ChevronLeft, Pencil, Send } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneFrame } from '@/components/PhoneFrame'
import { Progress } from '@/components/ui/progress'
import {
  DEMO_PATIENT_GENDER,
  getVisibleQuestions,
  isQuestionVisible,
  questionnaireQuestions,
  type QuestionnaireQuestion,
} from './mockData'
import { useQuestionnaireState, type AnswerValue } from './useQuestionnaireState'

export function Questionnaire() {
  const navigate = useNavigate()
  const visibleQuestions = useMemo(() => getVisibleQuestions(DEMO_PATIENT_GENDER), [])
  const wizard = useQuestionnaireState(visibleQuestions)

  const handleBack = () => {
    if (wizard.isSubmitted) {
      navigate('/home')
    } else if (wizard.isReview) {
      wizard.back()
    } else if (wizard.currentIndex === 0) {
      navigate('/home')
    } else {
      wizard.back()
    }
  }

  return (
    <PhoneFrame>
      <div data-testid="questionnaire" className="flex h-full flex-col">
        {!wizard.isSubmitted && (
          <QuestionnaireHeader
            currentIndex={wizard.currentIndex}
            isReview={wizard.isReview}
            onBack={handleBack}
            progress={wizard.progress}
            total={wizard.total}
          />
        )}

        <main className="flex-1 overflow-y-auto px-5 py-5">
          {wizard.isSubmitted ? (
            <QuestionnaireDone onHome={() => navigate('/home')} />
          ) : wizard.isReview ? (
            <QuestionnaireReview
              allQuestions={questionnaireQuestions}
              answers={wizard.answers}
              onEdit={(questionId) => {
                const index = visibleQuestions.findIndex((question) => question.id === questionId)
                if (index >= 0) wizard.goTo(index)
              }}
              onSubmit={wizard.submit}
              patientGender={DEMO_PATIENT_GENDER}
              visibleQuestions={visibleQuestions}
            />
          ) : wizard.currentQuestion ? (
            <QuestionStep
              answer={wizard.answer}
              currentAnswer={wizard.answers[wizard.currentQuestion.id]}
              error={wizard.error}
              isFirstQuestion={wizard.currentIndex === 0}
              isLastQuestion={wizard.currentIndex === visibleQuestions.length - 1}
              onBack={wizard.back}
              onNext={wizard.next}
              progress={wizard.progress}
              question={wizard.currentQuestion}
              total={wizard.total}
            />
          ) : null}
        </main>
      </div>
    </PhoneFrame>
  )
}

function QuestionnaireHeader({
  currentIndex,
  isReview,
  onBack,
  progress,
  total,
}: {
  currentIndex: number
  isReview: boolean
  onBack: () => void
  progress: number
  total: number
}) {
  const currentLabel = isReview ? '최종 확인' : `${currentIndex + 1}번 문항`

  return (
    <header className="border-b px-5 py-4">
      <div className="mb-3 flex items-center gap-2">
        <Button aria-label="뒤로" className="-ml-2" onClick={onBack} size="icon" variant="ghost">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <p className="text-sm font-semibold">사전문진</p>
          <p className="text-xs text-muted-foreground">
            {currentLabel} · {progress}/{total}문항 작성
          </p>
        </div>
      </div>
      <Progress aria-label="문진 진행률" value={total === 0 ? 0 : (progress / total) * 100} />
    </header>
  )
}

function QuestionStep({
  answer,
  currentAnswer,
  error,
  isFirstQuestion,
  isLastQuestion,
  onBack,
  onNext,
  progress,
  question,
  total,
}: {
  answer: (questionId: string, value: AnswerValue) => void
  currentAnswer: AnswerValue | undefined
  error: string | null
  isFirstQuestion: boolean
  isLastQuestion: boolean
  onBack: () => void
  onNext: () => boolean
  progress: number
  question: QuestionnaireQuestion
  total: number
}) {
  const selected = Array.isArray(currentAnswer) ? currentAnswer : []
  const stringAnswer = typeof currentAnswer === 'string' ? currentAnswer : ''
  const inputId = `question-${question.id}`

  const toggleOption = (option: string) => {
    const next = selected.includes(option)
      ? selected.filter((value) => value !== option)
      : [...selected, option]
    answer(question.id, next)
  }

  return (
    <section className="flex min-h-full flex-col" data-testid={`question-${question.id}`}>
      <div className="flex-1">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <p className="mb-2 text-sm text-muted-foreground">진료 전 확인</p>
            <h1 className="text-xl font-bold leading-relaxed">{question.text}</h1>
            {progress > 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                {total}문항 중 {progress}개를 작성하셨습니다. 이어서 작성하고 있어요.
              </p>
            )}
          </div>
          {question.required && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">필수</span>
          )}
        </div>

        <QuestionInput
          answer={answer}
          inputId={inputId}
          question={question}
          selected={selected}
          stringAnswer={stringAnswer}
          toggleOption={toggleOption}
        />

        <p className="mt-5 text-sm text-muted-foreground">입력하신 답변은 자동으로 저장됩니다.</p>
        {error && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="mt-8 flex gap-2 border-t pt-4">
        <Button className="flex-1" disabled={isFirstQuestion} onClick={onBack} variant="outline">
          이전
        </Button>
        <Button className="flex-1" onClick={onNext}>
          {isLastQuestion ? '최종 확인' : '다음'}
        </Button>
      </div>
    </section>
  )
}

function QuestionInput({
  answer,
  inputId,
  question,
  selected,
  stringAnswer,
  toggleOption,
}: {
  answer: (questionId: string, value: AnswerValue) => void
  inputId: string
  question: QuestionnaireQuestion
  selected: string[]
  stringAnswer: string
  toggleOption: (option: string) => void
}) {
  if (question.type === 'single' || question.type === 'multiple') {
    return (
      <div className="flex flex-col gap-2" role="group" aria-label={question.text}>
        {question.options?.map((option) => {
          const isSelected = question.type === 'single' ? stringAnswer === option : selected.includes(option)
          return (
            <Button
              aria-pressed={isSelected}
              className="h-auto justify-between whitespace-normal rounded-2xl px-4 py-4 text-left"
              key={option}
              onClick={() =>
                question.type === 'single' ? answer(question.id, option) : toggleOption(option)
              }
              variant={isSelected ? 'default' : 'outline'}
            >
              <span>{option}</span>
              {isSelected && <CheckCircle2 className="h-5 w-5" />}
            </Button>
          )
        })}
      </div>
    )
  }

  if (question.type === 'yes-no') {
    return (
      <div className="grid grid-cols-2 gap-3" role="group" aria-label={question.text}>
        {['예', '아니오'].map((option) => {
          const isSelected = stringAnswer === option
          return (
            <Button
              aria-pressed={isSelected}
              className="h-24 rounded-2xl text-base"
              key={option}
              onClick={() => answer(question.id, option)}
              variant={isSelected ? 'default' : 'outline'}
            >
              {option}
            </Button>
          )
        })}
      </div>
    )
  }

  if (question.type === 'long-text') {
    return (
      <div>
        <Label className="sr-only" htmlFor={inputId}>
          {question.text}
        </Label>
        <textarea
          aria-label={question.text}
          className="min-h-36 w-full resize-none rounded-xl border bg-background px-3 py-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          id={inputId}
          onChange={(event) => answer(question.id, event.target.value)}
          placeholder={question.placeholder}
          value={stringAnswer}
        />
      </div>
    )
  }

  return (
    <div>
      <Label className="sr-only" htmlFor={inputId}>
        {question.text}
      </Label>
      <Input
        aria-label={question.text}
        id={inputId}
        onChange={(event) => answer(question.id, event.target.value)}
        placeholder={question.placeholder}
        value={stringAnswer}
      />
    </div>
  )
}

function QuestionnaireReview({
  allQuestions,
  answers,
  onEdit,
  onSubmit,
  patientGender,
  visibleQuestions,
}: {
  allQuestions: QuestionnaireQuestion[]
  answers: Record<string, AnswerValue>
  onEdit: (questionId: string) => void
  onSubmit: () => boolean
  patientGender: 'female' | 'male'
  visibleQuestions: QuestionnaireQuestion[]
}) {
  const visibleIndexes = new Map(visibleQuestions.map((question, index) => [question.id, index]))
  const canSubmit = visibleQuestions.every((question) => Object.prototype.hasOwnProperty.call(answers, question.id))

  return (
    <section data-testid="questionnaire-review" className="pb-4">
      <div className="mb-6">
        <p className="mb-2 text-sm text-muted-foreground">마지막 단계</p>
        <h1 className="text-xl font-bold">작성한 내용을 확인해 주세요</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          제출하기 전 답변을 확인할 수 있어요. 진료 시작 전까지 수정할 수 있습니다.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {allQuestions.map((question) => {
          const isVisible = isQuestionVisible(question, patientGender)
          const hasAnswer = Object.prototype.hasOwnProperty.call(answers, question.id)
          const status = !isVisible ? '미표시' : hasAnswer ? '답' : '미작성'
          const answerText = hasAnswer ? formatAnswer(answers[question.id]) : ''
          const visibleIndex = visibleIndexes.get(question.id)

          return (
            <Card key={question.id} data-testid={`review-${question.id}`}>
              <CardHeader className="border-b">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="leading-relaxed">{question.text}</CardTitle>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                    {status}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3 pt-3">
                <p className="min-w-0 text-sm text-muted-foreground">
                  {!isVisible
                    ? '이 환자에게 표시되지 않은 문항입니다.'
                    : hasAnswer
                      ? answerText
                      : '아직 작성하지 않았어요.'}
                </p>
                {isVisible && visibleIndex !== undefined && (
                  <Button
                    aria-label={`${question.text} 수정`}
                    className="shrink-0"
                    onClick={() => onEdit(question.id)}
                    size="sm"
                    variant="ghost"
                  >
                    <Pencil /> 수정
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Button
        className="mt-6 w-full"
        disabled={!canSubmit}
        onClick={onSubmit}
        data-testid="questionnaire-submit"
      >
        <Send /> 제출하기
      </Button>
    </section>
  )
}

function formatAnswer(value: AnswerValue): string {
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '답 없음'
  return value.trim().length > 0 ? value : '답 없음'
}

function QuestionnaireDone({ onHome }: { onHome: () => void }) {
  return (
    <section data-testid="questionnaire-done" className="flex min-h-full flex-col items-center justify-center text-center">
      <CheckCircle2 className="mb-5 h-14 w-14 text-primary" />
      <h1 className="text-2xl font-bold">사전문진 제출 완료</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        작성하신 내용이 진료 준비에 전달됐어요.
        <br />
        진료 전까지 제출한 문진을 확인할 수 있습니다.
      </p>
      <Button className="mt-8 w-full" onClick={onHome}>
        홈으로
      </Button>
    </section>
  )
}

export default Questionnaire
