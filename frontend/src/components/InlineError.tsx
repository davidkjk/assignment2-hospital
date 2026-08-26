import { useEffect, useRef, type CSSProperties } from 'react'

// 동작(버튼) 실패 오류를 **실패한 버튼 바로 위**에 붙박이로 보인다(`ERR-POS-01~03`).
// - 문장은 서버가 준 것을 그대로 받는다(`ERR-MSG-01`) — 이 컴포넌트는 다시 쓰지 않는다.
// - 주의색 글자 + 좌측 4px 바, **배경 없음**(오프라인 띠와 구분).
// - 스낵바(자동 소멸)·화면 맨 위 띠를 쓰지 않는다.
// ⚠️ 버튼 위에 놓는 것은 부모(폼)의 몫이다 — 이 컴포넌트는 그 자리에 붙박이로 그려질 뿐이다.
//   언제 검사하고 언제 지우는지(`ERR-GONE-*`·`ERR-FLD-*`)도 폼이 정한다(Task 7).

interface InlineErrorProps {
  message: string
}

export function InlineError({ message }: InlineErrorProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // ERR-POS-02: 그 자리가 시야 밖이면 그리로 옮긴다. block:'nearest'라 이미 보이면 움직이지 않는다.
    ref.current?.scrollIntoView({ block: 'nearest' })
  }, [])

  return (
    <div ref={ref} role="alert" style={styles.alert}>
      {message}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  alert: {
    borderLeftWidth: 4,
    borderLeftStyle: 'solid',
    borderLeftColor: 'var(--color-warn)',
    background: 'none',
    color: 'var(--color-warn)',
    padding: '6px 0 6px 12px',
    fontSize: 'var(--fs-base)',
    fontWeight: 600,
    lineHeight: 1.4,
  },
}
