import { useState, type CSSProperties } from 'react'
import type { StaffProfile } from '../auth/roles'
import { AccountMenu } from './AccountMenu'
import { HOSPITAL_NAME } from './brand'
import { START_DOORS, type StartDoor } from './navItems'

export type { StartDoor } from './navItems'

export function Header({ staff, onSignOut, onStart = () => undefined }: { staff: StaffProfile; onSignOut: () => void | Promise<void>; onStart?: (door: StartDoor) => void }) {
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState('')
  const doors = START_DOORS.filter((door) => door.roles.includes(staff.role))
  return (
    <>
      <header style={headerStyle}>
        <span aria-label="병원 이름" style={hospitalNameStyle}>{HOSPITAL_NAME}</span>
        <div style={{ flex: 1 }} />
        <AccountMenu staff={staff} onPasswordChanged={() => setMessage('비밀번호를 바꿨습니다')} />
        <button type="button" onClick={() => setConfirming(true)} style={logoutStyle}>로그아웃</button>
        {doors.length > 0 && <div data-testid="start-door-group" aria-label="시작 업무" style={doorGroupStyle}>
          {doors.map((door) => <button type="button" key={door.key} data-testid="start-door" onClick={() => onStart(door.key)} style={{ ...doorStyle, ...(door.primary ? primaryDoorStyle : {}) }}>{door.label}</button>)}
        </div>}
      </header>
      {message && <div role="status" style={{ position: 'fixed', right: 24, bottom: 24, background: 'var(--color-ink)', color: 'white', padding: 12, borderRadius: 8, zIndex: 40 }}>{message}</div>}
      {confirming && <div style={dialogBackdrop}>
        <div role="dialog" aria-labelledby="logout-title" aria-modal="true" style={dialogStyle}>
          <h2 id="logout-title">로그아웃할까요?</h2>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" autoFocus onClick={() => setConfirming(false)}>취소</button>
            <button type="button" onClick={() => { setConfirming(false); void onSignOut() }}>로그아웃</button>
          </div>
        </div>
      </div>}
    </>
  )
}

const headerStyle: CSSProperties = { minHeight: 64, display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px', background: 'white', borderBottom: '1px solid var(--color-divider)' }
const hospitalNameStyle: CSSProperties = { fontWeight: 800, flexShrink: 0, whiteSpace: 'nowrap' }
const logoutStyle: CSSProperties = { border: 0, background: 'transparent', color: 'var(--color-ink-muted)', padding: '8px 12px', cursor: 'pointer' }
const doorGroupStyle: CSSProperties = { display: 'flex', gap: 6, marginLeft: 16, paddingLeft: 24, borderLeft: '1px solid var(--color-divider)' }
const doorStyle: CSSProperties = { minHeight: 36, border: '1px solid var(--color-divider)', borderRadius: 8, background: 'var(--color-bg)', color: 'var(--color-primary)', fontWeight: 800, padding: '0 13px', cursor: 'pointer' }
const primaryDoorStyle: CSSProperties = { background: 'var(--color-primary)', color: 'white', borderColor: 'var(--color-primary)' }
const dialogBackdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'var(--color-done-bg)', zIndex: 50, display: 'grid', placeItems: 'center' }
const dialogStyle: CSSProperties = { width: 340, maxWidth: '90%', padding: 24, borderRadius: 12, background: 'var(--color-surface)', boxShadow: 'var(--shadow-card)' }
