import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import iconSpriteUrl from './icons.svg?url'
import type { Role } from '../auth/roles'
import { navItemForPath, NAV_GROUPS, NAV_ITEMS } from './navItems'
import { NavBadge } from './NavBadge'
import { HOSPITAL_NAME } from './brand'

// 직원 콘솔 = 딥틸 잉크 사이드바(bg-sidebar-ink). 환자앱은 전 화면 흰색이라 이 하나로 두 surface가 갈린다.
// 좁은 폭(<xl)에선 아이콘만 남기고 라벨을 접는다(툴팁으로 이름 제공, SHELL-NAV-08).
export function Sidebar({ role, counts = {}, connected = true }: { role: Role; counts?: Record<string, number>; connected?: boolean }) {
  const visible = NAV_ITEMS.filter((item) => item.roles.includes(role))
  const doctorItem = visible.find((item) => item.group === null)
  const location = useLocation()
  const activePath = navItemForPath(location.pathname)?.path
  return (
    <aside className="staff-sidebar flex w-14 shrink-0 flex-col bg-sidebar-ink text-white xl:w-60">
      {/* 브랜드 (사이드바 top) — 병원명은 사이드바가 상시 표시한다(헤더는 화면 제목만) */}
      <div className="flex h-14 items-center gap-2 px-4 xl:px-5">
        <svg aria-hidden="true" className="h-6 w-6 shrink-0"><use href={`${iconSpriteUrl}#hospital`} /></svg>
        <span className="hidden font-logo text-xl xl:inline">{HOSPITAL_NAME}</span>
      </div>
      <div className="mx-5 mb-2 hidden border-b border-white/10 pb-3 text-[0.7rem] font-medium text-white/55 xl:block">
        직원 업무 시스템
      </div>

      <nav aria-label="직원 업무 메뉴" className="flex-1 overflow-y-auto px-2 pb-6 pt-1 xl:px-3">
        {doctorItem && <div className="mb-3"><NavItemLink item={doctorItem} counts={counts} connected={connected} activePath={activePath} /></div>}
        {NAV_GROUPS.map((group) => {
          const items = visible.filter((item) => item.group === group)
          if (!items.length) return null
          return (
            <section className="mt-4 first:mt-1" key={group}>
              <h2 className="mb-1 hidden px-3 text-[0.68rem] font-semibold uppercase tracking-wider text-white/55 xl:block">{group}</h2>
              <div className="flex flex-col gap-0.5">
                {items.map((item) => <NavItemLink key={item.path} item={item} counts={counts} connected={connected} activePath={activePath} />)}
              </div>
            </section>
          )
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
      className={({ isActive }) =>
        [
          'nav-item group relative flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors justify-center xl:justify-start',
          isActive || isDeepLinkActive ? 'active bg-white/15 font-semibold text-white' : 'text-white/85 hover:bg-white/8 hover:text-white',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          {/* 좌측 3px 흰 바 — 색만으로 구분하지 않는다 (SHELL-NAV-06) */}
          <span className={`absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-white transition-opacity ${isActive || isDeepLinkActive ? 'opacity-100' : 'opacity-0'}`} />
          <svg data-testid={`icon-${item.icon}`} aria-hidden="true" className="h-[1.1rem] w-[1.1rem] shrink-0"><use href={`${iconSpriteUrl}#${item.icon}`} /></svg>
          <span className="nav-label hidden truncate xl:inline">{item.label}</span>
          <NavBadge count={counts[item.path]} connected={connected} />
          {tooltipVisible && (
            <span
              id={tooltipId}
              role="tooltip"
              className="nav-tooltip absolute left-full top-1/2 z-30 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs text-white shadow-[var(--shadow-card)] xl:hidden"
            >
              {item.label}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}
