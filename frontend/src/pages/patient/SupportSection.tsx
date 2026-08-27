import type { CSSProperties } from 'react'
import { EmptyState } from '../../components/EmptyState'
import type { SectionState } from './format'

// [PTDET-SUPPORT-01~05] 상담봇에서 직원에게 넘어온 문의 — 질문·안내·인계 이유·상태를 한 카드에서(SUPPORT-01).
//   ⏳ BLOCKED — support_tickets 표·조회는 4단계 상담봇 플랜이 만든다. 이 화면은 **소비만** 한다:
//   서버 순서를 다시 정렬하지 않고(SUPPORT-03), 원시 enum을 번역만 한다(SUPPORT-02).

export interface SupportTicket {
  id: string
  question: string
  bot_answer: string
  handover_reason: string
  status: 'pending' | 'in_progress' | 'answered'
}

// 원시 enum을 화면에 그대로 노출하지 않는다(SUPPORT-02).
const STATUS_LABEL: Record<SupportTicket['status'], string> = {
  pending: '새 문의',
  in_progress: '처리 중',
  answered: '답변 완료',
}

interface SupportSectionProps {
  state: SectionState<SupportTicket[]>
}

export function SupportSection({ state }: SupportSectionProps) {
  // 서버가 준 순서 그대로 — 화면이 다시 정렬하지 않는다(SUPPORT-03).
  const tickets = state.data ?? []
  return (
    <section aria-label="상담 문의" style={styles.section}>
      <h2 style={styles.heading}>상담 문의</h2>
      {state.loading ? (
        <div data-testid="skeleton" aria-hidden="true" style={styles.skeleton} />
      ) : state.error ? (
        <EmptyState kind="error" onRetry={state.retry} />
      ) : tickets.length === 0 ? (
        <EmptyState kind="zero" message="직원에게 전달된 상담 문의가 없습니다" />
      ) : (
        <ul style={styles.list}>
          {tickets.map((t) => (
            <li key={t.id} data-id={t.id} style={styles.card}>
              <p style={styles.line}>
                <span style={styles.tag}>환자 질문</span>
                {t.question}
              </p>
              <p style={styles.line}>
                <span style={styles.tag}>상담봇 안내</span>
                {t.bot_answer}
              </p>
              <p style={styles.line}>
                <span style={styles.tag}>직원에게 넘어온 이유</span>
                {t.handover_reason}
              </p>
              <span style={styles.status}>{STATUS_LABEL[t.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  section: {
    padding: 16, background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-card)',
  },
  heading: { margin: '0 0 12px', fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--color-ink)' },
  skeleton: { height: 72, borderRadius: 6, background: 'var(--color-bg)' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 },
  card: {
    display: 'flex', flexDirection: 'column', gap: 4, padding: 12,
    background: 'var(--color-bg)', border: '1px solid var(--color-divider)', borderRadius: 8,
  },
  line: { margin: 0, display: 'flex', gap: 8, fontSize: 'var(--fs-base)', color: 'var(--color-ink)' },
  tag: { fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--color-ink-muted)', minWidth: 120 },
  status: { fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--color-primary)' },
}
