import type { CSSProperties } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { FileText } from '../../components/icons'
import { ConsoleCard } from './ConsoleCard'
import { mdHm } from '../patient/format'

// [DOCTOR-QNR-01~05] 사전문진 — 담당 의사만(ROLE-DOC-01). 읽기 전용, 작성란과 다른 영역. 제출 시각을
//   머리에, 저장 당시 질문 글자 스냅샷으로 질문-답변 표. 필수인데 빈 답은 「답변 없음」+주의 표시.
//   0건과 조회 실패·권한 제한을 각각 다른 문구로 가른다(QNR-03·04).

export interface QnrAnswer {
  question_id: string
  question_text: string
  value: string | null
  required?: boolean
}

export interface ConsoleQuestionnaire {
  submitted_at: string | null
  answers: QnrAnswer[]
}

interface QuestionnairePanelProps {
  canRead: boolean
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  questionnaire?: ConsoleQuestionnaire | null
}

export function QuestionnairePanel({ canRead, loading, error, onRetry, questionnaire }: QuestionnairePanelProps) {
  return (
    <ConsoleCard icon={<FileText width={16} height={16} />} title="사전문진" ariaLabel="사전문진">
      {!canRead ? (
        <p style={styles.denied}>이 예약을 볼 권한이 없습니다</p>
      ) : loading ? (
        <div data-testid="skeleton" aria-hidden="true" style={styles.skeleton} />
      ) : error ? (
        <EmptyState kind="error" onRetry={onRetry} />
      ) : !questionnaire || questionnaire.answers.length === 0 ? (
        <p style={styles.empty}>제출된 사전문진이 없습니다</p>
      ) : (
        <>
          {questionnaire.submitted_at && (
            <p style={styles.submitted}>{mdHm(questionnaire.submitted_at)} 제출</p>
          )}
          <dl style={styles.qa}>
            {questionnaire.answers.map((a) => {
              const empty = a.value === null || a.value === ''
              return (
                <div key={a.question_id} style={styles.qaRow}>
                  <dt style={styles.dt}>{a.question_text}</dt>
                  <dd style={empty ? { ...styles.dd, ...styles.ddEmpty } : styles.dd}>
                    {empty ? (
                      <span style={styles.warnWrap}>
                        <svg role="img" aria-label="주의" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 3 2 20h20L12 3Z" strokeLinejoin="round" />
                          <line x1="12" y1="10" x2="12" y2="14" strokeLinecap="round" />
                          <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
                        </svg>
                        답변 없음
                      </span>
                    ) : (
                      a.value
                    )}
                  </dd>
                </div>
              )
            })}
          </dl>
        </>
      )}
    </ConsoleCard>
  )
}

const styles: Record<string, CSSProperties> = {
  denied: { margin: 0, fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)' },
  empty: { margin: 0, fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)' },
  skeleton: { height: 60, borderRadius: 6, background: 'var(--color-bg)' },
  submitted: { margin: '0 0 var(--sp-2)', fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' },
  qa: { margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' },
  qaRow: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-0-5)' },
  dt: { margin: 0, fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  dd: { margin: 0, fontSize: 'var(--fs-body)', color: 'var(--color-ink)', overflowWrap: 'anywhere' },
  ddEmpty: { color: 'var(--color-warn)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'] },
  warnWrap: { display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-1)' },
}
