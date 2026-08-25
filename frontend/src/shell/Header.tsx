import { useState, type CSSProperties } from 'react'
import type { StaffProfile } from '../auth/roles'
import { AccountMenu } from './AccountMenu'

export type StartDoor = 'register' | 'checkin' | 'appointment'

export function Header({ staff, title = '직원 업무', onSignOut, onStart = () => undefined }: { staff: StaffProfile; title?: string; onSignOut: () => void | Promise<void>; onStart?: (door: StartDoor) => void }) {
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState('')
  const doors: readonly [StartDoor, string][] = [['register', '＋ 등록'], ['checkin', '＋ 접수'], ['appointment', '＋ 예약']]
  return (
    <>
      <header style={headerStyle}>
        <div style={{ fontWeight: 800 }}>{title}</div>
        <div style={{ flex: 1 }} />
        <AccountMenu staff={staff} onPasswordChanged={() => setMessage('비밀번호를 바꿨습니다')} />
        <button onClick={() => setConfirming(true)} style={logoutStyle}>로그아웃</button>
        {staff.role !== 'doctor' && <div style={doorGroupStyle}>
          {doors.map(([door, label]) => <button key={door} data-testid="start-door" onClick={() => onStart(door)} style={{ ...doorStyle, ...(door === 'checkin' ? primaryDoorStyle : {}) }}>{label}</button>)}
        </div>}
      </header>
      {message && <div role="status" style={{ position: 'fixed', right: 24, bottom: 24, background: 'var(--color-ink)', color: 'white', padding: 12, borderRadius: 8, zIndex: 40 }}>{message}</div>}
      {confirming && <div style={dialogBackdrop}>
        <div role="dialog" aria-labelledby="logout-title" aria-modal="true" style={dialogStyle}>
          <h2 id="logout-title">로그아웃할까요?</h2>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button autoFocus onClick={() => setConfirming(false)}>취소</button>
            <button onClick={() => void onSignOut()}>로그아웃</button>
          </div>
        </div>
      </div>}
    </>
  )
}

const headerStyle: CSSProperties = { minHeight: 64, display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px', background: 'white', borderBottom: '1px solid var(--color-divider)' }
const logoutStyle: CSSProperties = { border: 0, background: 'transparent', color: 'var(--color-ink-muted)', padding: '8px 12px', cursor: 'pointer' }
const doorGroupStyle: CSSProperties = { display: 'flex', gap: 6, marginLeft: 10, paddingLeft: 20, borderLeft: '1px solid var(--color-divider)' }
const doorStyle: CSSProperties = { minHeight: 36, border: '1px solid var(--color-divider)', borderRadius: 8, background: 'var(--color-bg)', color: 'var(--color-primary)', fontWeight: 800, padding: '0 13px', cursor: 'pointer' }
const primaryDoorStyle: CSSProperties = { background: 'var(--color-primary)', color: 'white', borderColor: 'var(--color-primary)' }
const dialogBackdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'var(--color-done-bg)', zIndex: 50, display: 'grid', placeItems: 'center' }
const dialogStyle: CSSProperties = { width: 340, maxWidth: '90%', padding: 24, borderRadius: 12, background: 'var(--color-surface)', boxShadow: 'var(--shadow-card)' }
