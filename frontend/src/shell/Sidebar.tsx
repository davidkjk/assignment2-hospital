import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import iconSpriteUrl from './icons.svg?url'
import type { Role } from '../auth/roles'
import { navItemForPath, NAV_GROUPS, NAV_ITEMS } from './navItems'
import { NavBadge } from './NavBadge'

export function Sidebar({ role, counts = {}, connected = true }: { role: Role; counts?: Record<string, number>; connected?: boolean }) {
  const visible = NAV_ITEMS.filter((item) => item.roles.includes(role))
  const doctorItem = visible.find((item) => item.group === null)
  const location = useLocation()
  const activePath = navItemForPath(location.pathname)?.path
  return (
    <aside className="staff-sidebar">
      <style>{sidebarCss}</style>
      <div className="staff-brand"><svg aria-hidden="true"><use href={`${iconSpriteUrl}#hospital`} /></svg><span>가온병원</span></div>
      <nav aria-label="직원 업무 메뉴">
        {doctorItem && <div className="doctor-link"><NavItemLink item={doctorItem} counts={counts} connected={connected} activePath={activePath} /></div>}
        {NAV_GROUPS.map((group) => {
          const items = visible.filter((item) => item.group === group)
          if (!items.length) return null
          return <section className="nav-group" key={group}><h2>{group}</h2>{items.map((item) => <NavItemLink key={item.path} item={item} counts={counts} connected={connected} activePath={activePath} />)}</section>
        })}
      </nav>
    </aside>
  )
}

function NavItemLink({ item, counts, connected, activePath }: { item: (typeof NAV_ITEMS)[number]; counts: Record<string, number>; connected: boolean; activePath?: string }) {
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const isDeepLinkActive = item.path === activePath
  const tooltipId = `nav-tooltip-${item.icon}`
  return (
    <NavLink
      to={item.path}
      end={item.path !== '/patients'}
      title={item.label}
      aria-label={item.label}
      aria-describedby={tooltipVisible ? tooltipId : undefined}
      aria-current={isDeepLinkActive ? 'page' : undefined}
      onMouseEnter={() => setTooltipVisible(true)}
      onMouseLeave={() => setTooltipVisible(false)}
      onFocus={() => setTooltipVisible(true)}
      onBlur={() => setTooltipVisible(false)}
      className={({ isActive }) => isActive || isDeepLinkActive ? 'nav-item active' : 'nav-item'}
    >
      <svg data-testid={`icon-${item.icon}`} aria-hidden="true"><use href={`${iconSpriteUrl}#${item.icon}`} /></svg>
      <span className="nav-label">{item.label}</span>
      <NavBadge count={counts[item.path]} connected={connected} />
      {tooltipVisible && <span id={tooltipId} className="nav-tooltip" role="tooltip">{item.label}</span>}
    </NavLink>
  )
}

const sidebarCss = `
.staff-sidebar{position:sticky;top:0;width:240px;height:100vh;flex:0 0 auto;background:var(--color-sidebar-ink);color:white;overflow:auto}.staff-brand{height:64px;display:flex;align-items:center;gap:10px;padding:0 18px;font-family:var(--font-logo);font-size:21px}.staff-brand svg,.nav-item svg{width:20px;height:20px;flex:none}.staff-sidebar nav{padding:5px 10px 24px}.nav-group{padding-top:12px;margin-top:12px}.nav-group+.nav-group{border-top:1px solid rgba(255,255,255,.28)}.nav-group h2{font-size:11px;margin:0 10px 6px;color:white}.nav-item{position:relative;display:flex;align-items:center;gap:9px;min-height:36px;padding:4px 10px 4px 13px;border-left:3px solid transparent;border-radius:7px;color:white;text-decoration:none;font-size:13px}.nav-item:hover{background:rgba(255,255,255,.12)}.nav-item.active{border-left-color:var(--color-primary);background:#dff3f2;color:var(--color-primary);font-weight:700}.doctor-link{margin-bottom:8px}.nav-tooltip{position:absolute;left:calc(100% + 8px);top:50%;transform:translateY(-50%);z-index:30;padding:6px 9px;border-radius:6px;background:var(--color-ink);color:white;white-space:nowrap;font-size:12px;pointer-events:none;box-shadow:var(--shadow-card)}
@media(min-width:1280px){.nav-tooltip{display:none}}
@media(max-width:1279px){.staff-sidebar{width:56px}.staff-brand{padding:0 16px}.staff-brand span,.nav-label,.nav-group h2{display:none}.staff-sidebar nav{padding-left:5px;padding-right:5px}.nav-group{padding-top:8px;margin-top:8px}.nav-item{padding:5px 10px;justify-content:center}.nav-tooltip{display:block}}
`
