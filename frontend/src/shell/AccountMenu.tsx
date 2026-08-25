import { useState, type CSSProperties } from 'react'
import { ROLE_LABEL, type StaffProfile } from '../auth/roles'
import { ChangePasswordPanel } from './ChangePasswordPanel'

export function AccountMenu({ staff, onPasswordChanged }: { staff: StaffProfile; onPasswordChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} style={chipStyle}>
        {staff.name} · {ROLE_LABEL[staff.role]} ▾
      </button>
      {open && <div role="menu" style={menuStyle}>
        <p><strong>내 정보</strong></p>
        <dl>
          <dt>이메일</dt><dd>{staff.email}</dd>
          <dt>진료과</dt><dd>{staff.departmentName ?? '해당 없음'}</dd>
          <dt>역할</dt><dd>{ROLE_LABEL[staff.role]}</dd>
        </dl>
        <button role="menuitem" onClick={() => { setOpen(false); setPanelOpen(true) }}>비밀번호 변경 ›</button>
      </div>}
      {panelOpen && <ChangePasswordPanel onClose={() => setPanelOpen(false)} onDone={() => { setPanelOpen(false); onPasswordChanged() }} />}
    </div>
  )
}

const chipStyle: CSSProperties = { border: 0, borderRadius: 18, background: 'var(--color-bg)', padding: '8px 12px', color: 'var(--color-ink)', cursor: 'pointer' }
const menuStyle: CSSProperties = { position: 'absolute', right: 0, top: 44, width: 270, padding: 16, borderRadius: 12, background: 'var(--color-surface)', boxShadow: 'var(--shadow-card)', zIndex: 20 }
