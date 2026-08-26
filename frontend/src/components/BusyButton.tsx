import { useState, type CSSProperties, type ReactNode } from 'react'

// 서버에 무언가를 남기는 버튼은 누른 순간부터 끝날 때까지 「◌ …중」으로 바뀌고, 그 사이 다시
// 눌러도 한 번만 간다(`BTN-BUSY-*`). 딥틸 콘솔의 규율: 처리 중을 **회색으로 칠하지 않는다** —
// 이 앱에서 회색은 "꺼짐"이라 다시 누르거나 화면을 떠나게 된다. 흐린 딥틸로 살려 둔다(`BTN-STATE-02`).
//
// ⚠️ 버튼 「문구」(예: "예약 신청 중…")는 화면마다 다르므로 busyLabel로 받는다(`BTN-EXIT-*`는 Task 9·14).

/** 서버에 상태를 남기는 동작에만 처리중 표시를 붙인다(`BTN-SCOPE-01·02`). 조회·이동·펼치기는 대상 아님. */
export function needsBusyState(action: { method?: string; kind?: string }): boolean {
  if (action.kind === 'navigate' || action.kind === 'expand') return false
  const m = action.method?.toUpperCase()
  return m === 'POST' || m === 'PATCH' || m === 'PUT' || m === 'DELETE'
}

interface BusyButtonProps {
  label: ReactNode
  /** 처리 중 문구 — 없으면 label을 그대로 쓴다. 글자를 비우지 않는 게 핵심이다. */
  busyLabel?: ReactNode
  onClick?: () => void | Promise<void>
  /** 밖에서 처리중을 다스릴 때(컨트롤드). 없으면 onClick 동안 스스로 처리중이 된다. */
  busy?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
}

export function BusyButton({ label, busyLabel, onClick, busy, disabled, type = 'button' }: BusyButtonProps) {
  const [pending, setPending] = useState(false)
  const isBusy = busy ?? pending

  async function handleClick() {
    if (isBusy || disabled) return // 처리 중 또 눌러도 무시한다(BTN-BUSY-02)
    if (busy === undefined) setPending(true)
    try {
      await onClick?.()
    } finally {
      if (busy === undefined) setPending(false)
    }
  }

  return (
    <button
      type={type}
      onClick={handleClick}
      disabled={disabled}
      aria-busy={isBusy}
      style={isBusy ? { ...styles.base, ...styles.busy } : styles.base}
    >
      {isBusy ? <>◌ {busyLabel ?? label}</> : label}
    </button>
  )
}

const styles: Record<string, CSSProperties> = {
  base: {
    height: 34,
    padding: '0 16px',
    borderRadius: 8,
    border: 'none',
    background: 'var(--color-primary)',
    color: '#fff',
    fontSize: 'var(--fs-base)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  // 흐린 딥틸 — 회색(꺼짐)이 아니라 "일하는 중"임을 색으로 지킨다.
  busy: { background: 'var(--color-sidebar-ink)', cursor: 'progress' },
}
