import { useState, type CSSProperties } from 'react'
import { BusyButton } from '../../components/BusyButton'
import { InlineError } from '../../components/InlineError'

// [PTDET-ACTION-02·03][#4 ㉯] 전화번호 변경 — 직접 저장 한 번으로 계정 번호를 바꾸지 않는다.
//   새 번호 입력 → 새 번호 인증(OTP) → 확인. 실패하면 성공한 척하지 않고 원인과 다음 경로(다시 받기)를
//   패널 안에 보인다. 기존 번호는 성공 전까지 그대로다(헤더는 페이지가 지킨다).
//   ⏳ BLOCKED — OTP 발송·검증·Auth 동기화·변경 이력 API가 없다(갭 #19). 콜백으로 주입받아 흐름만 완성한다.

interface PhoneChangePanelProps {
  currentPhone: string
  /** 새 번호로 인증번호를 보낸다(다음/다시 받기). BLOCKED 창구를 페이지가 주입한다. */
  onRequestCode: (newPhone: string) => Promise<void>
  /** 인증번호를 검증한다 — 실패하면 throw. 성공해야만 번호가 바뀐다. */
  onConfirm: (newPhone: string, code: string) => Promise<void>
  /** 성공 후 — 페이지가 헤더 번호를 새로 읽고 패널을 닫는다. */
  onDone: () => void
}

export function PhoneChangePanel({ currentPhone, onRequestCode, onConfirm, onDone }: PhoneChangePanelProps) {
  const [step, setStep] = useState<'enter' | 'verify'>('enter')
  const [newPhone, setNewPhone] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function requestCode() {
    if (!newPhone.trim()) {
      setError('새 전화번호를 입력해주세요.')
      return
    }
    setError(null)
    await onRequestCode(newPhone.trim())
    setStep('verify')
  }

  async function confirm() {
    setError(null)
    try {
      await onConfirm(newPhone.trim(), code.trim())
      onDone()
    } catch (e) {
      // 실패하면 기존 번호를 지킨다 — onDone을 부르지 않는다. 원인은 패널 안에 남긴다(ACTION-03).
      setError(e instanceof Error ? e.message : '인증에 실패했습니다.')
    }
  }

  return (
    <div style={styles.wrap}>
      <p style={styles.current}>
        현재 번호 <span style={styles.currentNum}>{currentPhone}</span>
      </p>

      <label style={styles.field}>
        새 전화번호
        <input
          value={newPhone}
          onChange={(e) => setNewPhone(e.target.value)}
          disabled={step === 'verify'}
          style={styles.input}
          inputMode="tel"
        />
      </label>

      {step === 'verify' && (
        <label style={styles.field}>
          인증번호
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={styles.input}
            inputMode="numeric"
          />
        </label>
      )}

      {error && <InlineError message={error} />}

      <div style={styles.actions}>
        {step === 'enter' ? (
          <BusyButton label="다음" busyLabel="보내는 중…" onClick={requestCode} />
        ) : (
          <>
            <button
              type="button"
              onClick={() => onRequestCode(newPhone.trim())}
              style={styles.resend}
            >
              다시 받기
            </button>
            <BusyButton label="확인" busyLabel="확인 중…" onClick={confirm} />
          </>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' },
  current: { margin: 0, fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  currentNum: { fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' },
  field: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], color: 'var(--color-ink-muted)' },
  input: {
    height: 34, padding: '0 var(--sp-3)', borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 'var(--fs-body)',
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)' },
  resend: {
    height: 34, padding: '0 var(--sp-3)', borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-primary)', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
}
