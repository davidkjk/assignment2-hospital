export type PatientGender = 'female' | 'male'

export type QuestionnaireQuestionType = 'single' | 'multiple' | 'yes-no' | 'text' | 'long-text'

export type QuestionVisibility = 'all' | PatientGender

export type QuestionnaireQuestion = {
  id: string
  text: string
  type: QuestionnaireQuestionType
  required?: boolean
  options?: string[]
  placeholder?: string
  visibleFor?: QuestionVisibility
}

/**
 * 문항 번호는 질문 글자와 분리된 안정적인 열쇠다(QNR-ID-*).
 * 이 폴더의 목업은 실제 서버 저장소가 아니라 문진 화면 시연용이다.
 */
export const questionnaireQuestions: QuestionnaireQuestion[] = [
  {
    id: 'q-discomfort',
    text: '오늘 어디가 불편하신가요?',
    type: 'long-text',
    required: true,
    placeholder: '증상이나 불편한 점을 적어 주세요',
  },
  {
    id: 'q-duration',
    text: '통증이 며칠 됐나요?',
    type: 'single',
    required: true,
    options: ['오늘부터', '2~3일', '4~7일', '1주일 이상'],
  },
  {
    id: 'q-medication',
    text: '현재 복용 중인 약이 있으신가요?',
    type: 'yes-no',
    required: true,
  },
  {
    id: 'q-medication-name',
    text: '어떤 약을 드시고 계신가요?',
    type: 'text',
    placeholder: '약 이름을 입력해 주세요. 없으면 비워 두셔도 됩니다.',
  },
  {
    id: 'q-symptoms',
    text: '함께 나타나는 증상을 모두 골라 주세요.',
    type: 'multiple',
    options: ['발열', '기침', '메스꺼움', '어지러움'],
  },
  {
    id: 'q-allergy',
    text: '알레르기가 있으신가요?',
    type: 'yes-no',
    required: true,
  },
  {
    id: 'q-pregnancy',
    text: '임신 가능성이 있으신가요?',
    type: 'yes-no',
    required: true,
    visibleFor: 'female',
  },
]

/** 데모에서는 본인 문진으로 가정한다. 실제 앱에서는 진료받는 사람의 성별을 사용한다. */
export const DEMO_PATIENT_GENDER: PatientGender = 'female'

export function isQuestionVisible(
  question: QuestionnaireQuestion,
  patientGender: PatientGender,
): boolean {
  return !question.visibleFor || question.visibleFor === 'all' || question.visibleFor === patientGender
}

export function getVisibleQuestions(
  patientGender: PatientGender = DEMO_PATIENT_GENDER,
): QuestionnaireQuestion[] {
  return questionnaireQuestions.filter((question) => isQuestionVisible(question, patientGender))
}
