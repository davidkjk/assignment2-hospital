import { NavLink } from 'react-router-dom'
import type { Role } from '../auth/roles'
import { NAV_GROUPS, NAV_ITEMS } from './navItems'
import { NavBadge } from './NavBadge'

export function Sidebar({ role, counts = {}, connected = true }: { role: Role; counts?: Record<string, number>; connected?: boolean }) {
  const visible = NAV_ITEMS.filter((item) => item.roles.includes(role))
  const doctorItem = visible.find((item) => item.group === null)
  return (
    <aside className="staff-sidebar">
      <style>{sidebarCss}</style>
      <div className="staff-brand"><svg><use href="/src/shell/icons.svg#hospital" /></svg><span>가온병원</span></div>
      <nav aria-label="직원 업무 메뉴">
        {doctorItem && <div className="doctor-link">{renderItem(doctorItem, counts, connected)}</div>}
        {NAV_GROUPS.map((group) => {
          const items = visible.filter((item) => item.group === group)
          if (!items.length) return null
          return <section className="nav-group" key={group}><h2>{group}</h2>{items.map((item) => renderItem(item, counts, connected))}</section>
        })}
      </nav>
    </aside>
  )
}

function renderItem(item: (typeof NAV_ITEMS)[number], counts: Record<string, number>, connected: boolean) {
  return (
    <NavLink key={item.path} to={item.path} title={item.label} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
      <svg data-testid={`icon-${item.icon}`} aria-hidden="true"><use href={`/src/shell/icons.svg#${item.icon}`} /></svg>
      <span className="nav-label">{item.label}</span>
      <NavBadge count={counts[item.path]} connected={connected} />
    </NavLink>
  )
}

const sidebarCss = `
.staff-sidebar{width:240px;min-height:100vh;flex:0 0 auto;background:var(--color-sidebar-ink);color:white;overflow:auto}.staff-brand{height:64px;display:flex;align-items:center;gap:10px;padding:0 18px;font-family:var(--font-logo);font-size:21px}.staff-brand svg,.nav-item svg{width:20px;height:20px;flex:none}.staff-sidebar nav{padding:5px 10px 24px}.nav-group{border-top:1px solid var(--color-primary);padding-top:12px;margin-top:12px}.nav-group h2{font-size:11px;margin:0 10px 6px;color:white}.nav-item{position:relative;display:flex;align-items:center;gap:9px;min-height:36px;padding:4px 10px 4px 13px;border-left:3px solid transparent;border-radius:7px;color:white;text-decoration:none;font-size:13px}.nav-item:hover{background:var(--color-primary)}.nav-item.active{border-left-color:white;background:var(--color-primary);color:white;font-weight:700}.doctor-link{margin-bottom:8px}
@media(max-width:1279px){.staff-sidebar{width:56px}.staff-brand{padding:0 16px}.staff-brand span,.nav-label,.nav-group h2{display:none}.staff-sidebar nav{padding-left:5px;padding-right:5px}.nav-group{padding-top:8px;margin-top:8px}.nav-item{padding:5px 10px;justify-content:center}.nav-item>span[aria-label]{position:absolute;right:1px;top:0;font-size:10px}}
`
