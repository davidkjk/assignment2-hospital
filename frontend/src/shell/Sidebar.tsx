import {
  Activity, AlertCircle, BarChart3, CalendarCheck2, CalendarDays, ClipboardList, ConfettiIcon,
  FileText, FlagIcon, History, Layers3, MessageCircle, SealQuestionIcon, Search, Send, Settings,
  ShieldCheck, Sparkles, Stethoscope, UserRoundPlus, Users, Hospital,
} from '@/components/icons'
import { useState, type ComponentType } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
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
    <aside className="staff-sidebar flex w-14 shrink-0 flex-col bg-sidebar-ink text-white xl:w-48">
      {/* 브랜드 (사이드바 top) — 병원명은 사이드바가 상시 표시한다(헤더는 화면 제목만) */}
      <div className="flex h-14 items-center gap-2 px-4 xl:px-5">
        <Hospital aria-hidden className="h-6 w-6 shrink-0 text-white" />
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
              {/* 항목이 하나뿐인 그룹엔 헤더를 붙이지 않는다 — 카테고리 한 줄 위 라벨은 소음이다(의사: 「환자 검색」 위 「업무」 제거). 오늘은 의사 콘솔만 해당. */}
              {items.length > 1 && <h2 className="mb-1 hidden px-3 text-[0.68rem] font-semibold uppercase tracking-wider text-white/55 xl:block">{group}</h2>}
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
          <NavIcon name={item.icon} />
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

// 사이드바 아이콘 — 데모와 같은 Phosphor 채움(Solid) 벡터(`DISP-ICON-03`).
// ⚠️ `navItems.ts`는 순수 데이터(문자열 키)로 남긴다 — 역할표 단일 원본에 JSX를 섞지 않는다.
const NAV_ICONS: Record<string, ComponentType<{ className?: string; 'data-testid'?: string; 'aria-hidden'?: boolean }>> = {
  stethoscope: Stethoscope,
  today: Activity,
  queue: Users,
  calendar: CalendarDays,
  search: Search,
  message: MessageCircle,
  send: Send,
  chart: BarChart3,
  shield: ShieldCheck,
  log: ClipboardList,
  merge: Layers3,
  history: History,
  warning: AlertCircle,
  book: Sparkles,
  question: SealQuestionIcon,
  flag: FlagIcon,
  quality: ConfettiIcon,
  bot: MessageCircle,
  staff: UserRoundPlus,
  schedule: CalendarCheck2,
  form: FileText,
  settings: Settings,
}

// 아이콘 없는 메뉴 항목을 만들지 않는다 — 하나라도 비면 아이콘 모드에서 그 항목만 사라진다(SHELL-NAV-11).
function NavIcon({ name }: { name: string }) {
  const Icon = NAV_ICONS[name] ?? Activity
  return <Icon aria-hidden data-testid={`icon-${name}`} className="h-[1.1rem] w-[1.1rem] shrink-0" />
}
