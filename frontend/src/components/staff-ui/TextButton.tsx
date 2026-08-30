import type { ButtonHTMLAttributes, CSSProperties } from 'react'

/** 구화면(인라인 style·px 토큰)용 공용 텍스트 버튼.
 *  L28: "사진 지우기 / ‹ 뒤로 / 더 보기" 같은 링크형 버튼이 화면마다 같은 스타일을
 *  각자 복붙하던 것을 하나로 모은다. 신화면(Tailwind)은 `buttons.ts`의 `btnLink`를 쓴다.
 *  - tone='link'(기본): 딥틸(primary) 글자 — 평범한 이동·펼침 동작.
 *  - tone='quiet': 약한 회색(ink-muted) — 되돌리기 어려운 동작을 눈에 덜 띄게(사진 지우기 등).
 *  밑줄은 hover에서만(전역 규칙 `.staff-text-btn:hover`, theme.css). */
export type TextButtonTone = 'link' | 'quiet'

const TONE_COLOR: Record<TextButtonTone, string> = {
  link: 'var(--color-primary)',
  quiet: 'var(--color-ink-muted)',
}

const BASE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: 0,
  border: 'none',
  background: 'none',
  fontSize: 'var(--fs-sm)',
  fontWeight: 600,
  lineHeight: 1.4,
  cursor: 'pointer',
}

export function TextButton({
  tone = 'link',
  style,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: TextButtonTone }) {
  return (
    <button
      type="button"
      className={`staff-text-btn ${className}`.trim()}
      style={{ ...BASE, color: TONE_COLOR[tone], ...style }}
      {...rest}
    />
  )
}
