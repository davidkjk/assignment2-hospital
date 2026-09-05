import type { CSSProperties, ReactNode } from 'react'

// 0건·조회 실패·오프라인 — 셋은 서로 다른 말이다(`EMPTY-*`). 화면은 이 컴포넌트로만
// 빈 상태를 그리고 자기 나름의 빈 화면을 새로 만들지 않는다. 딥틸 직원 콘솔의 각진 촘촘한
// 결을 따라, 아이콘·문장·나가는 문을 세로로 가지런히 둔다(색·간격은 정본 토큰만).

export type EmptyKind = 'offline' | 'error' | 'zero'

interface EmptyStateProps {
  kind: EmptyKind
  /** 화면 이름 — 오프라인 문장에 넣는다(`EMPTY-LAY-02`). 예: "가족 목록" */
  screen?: string
  /** 0건일 때 그 화면의 사실 문장(`EMPTY-ZERO-01`). 예: "대기 중인 환자가 없습니다" */
  message?: string
  /** 조회 실패·오프라인의 [다시 시도](`ERR-RETRY-02`). 0건에는 넘겨도 만들지 않는다. */
  onRetry?: () => void
  /** 나가는 문 하나 — 그 화면의 다음 행동(`EMPTY-LAY-01`). 예: 새 예약 링크 */
  action?: ReactNode
}

// 받침 유무로 목적격 조사를 고른다(`연결되면 가족 목록을` / `연결되면 사전문진표를`).
function objectParticle(word: string): string {
  const last = word.charCodeAt(word.length - 1)
  if (last < 0xac00 || last > 0xd7a3) return '을' // 한글이 아니면 기본값
  return (last - 0xac00) % 28 === 0 ? '를' : '을'
}

interface Copy {
  title: string
  hint?: string
  showRetry: boolean
}

function copyFor(props: EmptyStateProps): Copy {
  if (props.kind === 'offline') {
    const name = props.screen ?? '내용'
    return {
      title: '인터넷이 연결되어 있지 않습니다',
      hint: `연결되면 ${name}${objectParticle(name)} 볼 수 있습니다`,
      showRetry: true,
    }
  }
  if (props.kind === 'error') {
    return { title: '정보를 불러오지 못했습니다', hint: '잠시 후 다시 시도해주세요', showRetry: true }
  }
  // zero — 실패가 아니라 사실이라 [다시 시도]를 두지 않는다(`EMPTY-ZERO-02`).
  return { title: props.message ?? '', showRetry: false }
}

export function EmptyState(props: EmptyStateProps) {
  const { title, hint, showRetry } = copyFor(props)
  return (
    <div role="status" style={styles.wrap}>
      <div data-testid="empty-icon" aria-hidden="true" style={styles.icon}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          {props.kind === 'offline' ? (
            <>
              <path d="M2 8.5a15 15 0 0 1 20 0" strokeLinecap="round" />
              <path d="M5.5 12a10 10 0 0 1 13 0" strokeLinecap="round" />
              <path d="M9 15.5a5 5 0 0 1 6 0" strokeLinecap="round" />
              <line x1="3" y1="3" x2="21" y2="21" strokeLinecap="round" />
              <circle cx="12" cy="19" r="0.6" fill="currentColor" stroke="none" />
            </>
          ) : props.kind === 'error' ? (
            <>
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="8" x2="12" y2="13" strokeLinecap="round" />
              <circle cx="12" cy="16.3" r="0.6" fill="currentColor" stroke="none" />
            </>
          ) : (
            <>
              <rect x="4" y="5" width="16" height="14" rx="1.5" />
              <line x1="4" y1="10" x2="20" y2="10" />
            </>
          )}
        </svg>
      </div>
      <p style={styles.title}>{title}</p>
      {hint && <p style={styles.hint}>{hint}</p>}
      {(showRetry && props.onRetry) || props.action ? (
        <div style={styles.actions}>
          {showRetry && props.onRetry && (
            <button type="button" onClick={props.onRetry} style={styles.retry}>다시 시도</button>
          )}
          {props.action}
        </div>
      ) : null}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    padding: '56px var(--sp-6)',
    textAlign: 'center',
    color: 'var(--color-ink)',
  },
  icon: {
    width: 44,
    height: 44,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 8,
    background: 'var(--color-bg)',
    color: 'var(--color-ink-muted)',
    border: '1px solid var(--color-divider)',
  },
  title: { margin: 'var(--sp-1) 0 0', fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'] },
  hint: { margin: 0, fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)' },
  actions: { display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)', alignItems: 'center' },
  retry: {
    height: 32,
    padding: '0 var(--sp-4)',
    borderRadius: 8,
    border: '1px solid var(--color-primary)',
    background: 'var(--color-surface)',
    color: 'var(--color-primary)',
    fontSize: 'var(--fs-body)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
}
