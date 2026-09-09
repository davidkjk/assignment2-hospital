import type { CSSProperties } from 'react'

// 사이드바 항목 오른쪽의 미확인 건수 배지(상담봇 문의함·안내 보내기 등). 딥틸 사이드바 위에서
// 얇은 숫자만 두면 올라가도 눈에 안 띈다는 지적(2026-09-09) → **채움 pill**(배경색 + 흰 글자)로 또렷하게.
// 연결이 끊겼으면 회색 pill로 낮추고(색만으로 구분하지 않게) title로 사유를 준다. 0이면 그리지 않는다.
export function NavBadge({ count, connected = true }: { count?: number; connected?: boolean }) {
  if (!count) return null
  return (
    <span
      aria-label={connected ? `${count}건` : `${count}건, 연결 끊김`}
      title={connected ? undefined : '연결 끊김'}
      style={{
        marginLeft: 'auto',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 18,
        height: 18,
        padding: '0 5px',
        borderRadius: 999,
        background: connected ? 'var(--color-warn)' : 'var(--color-gray-past)',
        color: '#fff',
        fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'],
        fontSize: 11,
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {count}
    </span>
  )
}
