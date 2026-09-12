import type { CSSProperties } from 'react'

// 조회(읽기) 대기 표시 — 스피너와 문구를 한 덩어리로 모아 가운데에 둔다.
// 빈·실패는 EmptyState, 대기는 이 컴포넌트로만 그린다: 두 상태가 같은 자리에 번갈아
// 나타나므로 딥틸 직원 콘솔의 결(테알 링·조용한 회색 문구)을 맞춘다.
//   variant='page' 페이지 본문 통짜 로딩 — 화면 세로 가운데(min 55vh).
//   variant='card' 카드·패널 안 로딩 — 그 상자 안에서만 가운데(부모 높이를 채운다).
// ⚠️ 목록·표의 스켈레톤, 드롭다운·"더 보기" 같은 작은 인라인 대기에는 쓰지 않는다.

export function LoadingState({
  message = '불러오는 중입니다',
  variant = 'page',
}: {
  message?: string
  variant?: 'page' | 'card'
}) {
  return (
    <div role="status" aria-live="polite" style={variant === 'card' ? styles.wrapCard : styles.wrapPage}>
      <span aria-hidden="true" className="animate-spin motion-reduce:animate-none" style={styles.spinner} />
      <p style={styles.text}>{message}</p>
    </div>
  )
}

const base: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--sp-2)',
  padding: '0 var(--sp-6)',
  textAlign: 'center',
}

const styles: Record<string, CSSProperties> = {
  wrapPage: { ...base, minHeight: '55vh' },
  wrapCard: { ...base, height: '100%', minHeight: '40vh', padding: '40px var(--sp-6)' },
  spinner: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    border: '2.5px solid var(--color-divider)',
    borderTopColor: 'var(--color-primary)',
  },
  text: { margin: 0, fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)' },
}
