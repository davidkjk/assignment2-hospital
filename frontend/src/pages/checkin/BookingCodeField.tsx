import { forwardRef, type CSSProperties, type KeyboardEvent } from 'react'
import { InlineError } from '../../components/InlineError'

// [CHKIN-CODE-01·02·04·07] 예약번호 직접 입력 — QR이 없을 때의 보조 경로.
// - 한 칸 6자리. 앞뒤 공백을 지우고 대문자로 바꾼다. 허용 문자 목록(0/O 제외 등)은 늘어놓지 않는다 —
//   그 규칙은 서버(generate_booking_code)가 지키고, 화면이 베껴 적으면 두 곳이 어긋난다(CHKIN-CODE-02).
// - 형식 오류는 [예약번호로 찾기] 바로 위에 붙박이로(ERR-POS). Enter와 버튼이 같은 조회를 부른다.
// - ⭐ CODE-07: 이 화면은 「예약번호를 아는 사람」 전용이다. 이름으로는 못 찾는다는 사실을 화면 안에서
//   말한다 — 오류가 아니라 항상 있는 안내라 회색 작은 글씨로 둔다(ERR-* 아님).

export const BookingCodeField = forwardRef<HTMLInputElement, {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  fieldError: string | null
  busy: boolean
  offline: boolean
  onGoToQueue: () => void
}>(function BookingCodeField(
  { value, onChange, onSubmit, fieldError, busy, offline, onGoToQueue },
  ref,
) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      onSubmit()
    }
  }

  return (
    <div style={styles.wrap}>
      <label htmlFor="booking-code" style={styles.label}>
        QR이 없나요? 예약번호 직접 입력
      </label>
      <p style={styles.hint}>환자가 보여 준 6자리 예약번호를 입력하세요</p>

      <input
        id="booking-code"
        ref={ref}
        value={value}
        // 정규화는 여기서 한 번 — 붙여넣기·타이핑 모두 대문자·공백제거로 들어온다(CHKIN-CODE-02).
        onChange={(e) => onChange(e.target.value.trim().toUpperCase())}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        inputMode="text"
        maxLength={6}
        aria-invalid={fieldError ? true : undefined}
        style={styles.input}
      />

      {fieldError && <InlineError message={fieldError} />}

      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || offline}
        aria-busy={busy}
        style={busy ? { ...styles.submit, ...styles.submitBusy } : styles.submit}
      >
        {busy ? '예약번호 확인 중…' : '예약번호로 찾기'}
      </button>

      {/* CODE-07 — 이 화면이 못 하는 일을 화면 안에서 말한다. 막다른 길을 열어 준다(P-04). */}
      <div style={styles.escape}>
        <span style={styles.escapeText}>
          예약번호를 모르는 환자는 대기 목록에서 이름으로 찾을 수 있습니다
        </span>
        <button type="button" style={styles.escapeLink} onClick={onGoToQueue}>
          대기 목록으로
        </button>
      </div>
    </div>
  )
})

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 8 },
  label: { fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--color-ink)' },
  hint: { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  input: {
    height: 44,
    padding: '0 12px',
    borderRadius: 8,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-lg)',
    fontWeight: 700,
    letterSpacing: '0.18em',
    fontVariantNumeric: 'tabular-nums',
  },
  submit: {
    height: 40, padding: '0 16px', borderRadius: 8, border: '1px solid var(--color-primary)',
    background: 'var(--color-primary)', color: 'var(--color-surface)', fontSize: 'var(--fs-base)', fontWeight: 700, cursor: 'pointer',
  },
  submitBusy: { background: 'var(--color-sidebar-ink)', border: '1px solid var(--color-sidebar-ink)', cursor: 'progress' },
  escape: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  escapeText: { fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  escapeLink: {
    fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--color-primary)',
    background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline',
  },
}
