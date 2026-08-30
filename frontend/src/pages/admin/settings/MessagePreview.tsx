import type { CSSProperties } from 'react'

// [HSET-MSG-13][HSET-MSG-17] 값이 채워진 미리보기 — 잠금화면에 뜰 모습을 그대로 보여준다.
// {토큰}은 예시 값으로 치환하고, 값이 없으면 그 자리(와 붙은 공백)만 조용히 뺀다(당일 접수엔 시각이 없음).

const SAMPLE: Record<string, string | null> = {
  이름: '김환자',
  날짜: '8월 12일',
  시각: '14:00',
}

export function fillPreview(template: string, sample: Record<string, string | null> = SAMPLE): string {
  let out = template
  for (const [key, value] of Object.entries(sample)) {
    const token = `{${key}}`
    if (value === null) {
      out = out.split(`${token} `).join('').split(` ${token}`).join('').split(token).join('')
    } else {
      out = out.split(token).join(value)
    }
  }
  return out
}

export function MessagePreview({ body }: { body: string }) {
  return (
    <div style={styles.card} aria-label="문구 미리보기">
      <p style={styles.text}>{fillPreview(body)}</p>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  card: { border: '1px solid var(--color-divider)', borderRadius: 8, padding: 10, background: 'var(--color-surface)' },
  text: { margin: 0, fontSize: 'var(--fs-caption)' },
}
