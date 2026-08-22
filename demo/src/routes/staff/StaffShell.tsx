import { useState, type ComponentType } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertCircle,
  BarChart3,
  CalendarCheck2,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  ClipboardList,
  ConfettiIcon,
  FileText,
  FlagIcon,
  History,
  Hospital,
  Layers3,
  LockKeyhole,
  LogOut,
  MessageCircle,
  QrCode,
  SealQuestionIcon,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserPlus,
  UserRound,
  UserRoundPlus,
  Users,
  X,
} from '@/components/icons'
import { CheckinPanel } from './checkin/CheckinPanel'
import { ROLE_LABEL, navBadges, type StaffRole } from './mockData'
import { useStaff } from './staffState'

type Icon = ComponentType<{ className?: string }>
interface NavItem {
  to: string
  label: string
  icon: Icon
}
interface NavGroup {
  key: string
  label: string
  items: NavItem[]
}

// 진료 화면 = 의사 전용, 그룹 밖 단독 (SHELL-NAV-01)
const DOCTOR_CONSOLE: NavItem = { to: '/staff/doctor/console', label: '진료 화면', icon: Stethoscope }

const GROUPS: NavGroup[] = [
  {
    key: 'work',
    label: '업무',
    items: [
      { to: '/staff/today', label: '오늘의 현황', icon: Activity },
      { to: '/staff/queue', label: '대기 목록', icon: Users },
      // 접수(QR·예약번호)는 사이드바가 아니라 헤더 [QR 접수] 패널로 이동 — 새 예약·당일 방문과 같은 '창구 시작 동작' 묶음.
      { to: '/staff/calendar', label: '예약 캘린더', icon: CalendarDays },
      { to: '/staff/patients', label: '환자 검색', icon: Search },
      { to: '/staff/tickets', label: '문의 티켓함', icon: MessageCircle },
      { to: '/staff/chatlog', label: '전체 상담 기록', icon: ClipboardList },
      { to: '/staff/messages', label: '안내 보내기', icon: Send },
    ],
  },
  {
    key: 'record',
    label: '기록',
    items: [
      { to: '/staff/admin/stats', label: '운영 통계', icon: BarChart3 },
      { to: '/staff/admin/access-logs', label: '접근 기록', icon: ShieldCheck },
      { to: '/staff/admin/patient-merge-candidates', label: '중복 환자', icon: Layers3 },
      { to: '/staff/admin/merge-history', label: '병합 이력', icon: History },
      { to: '/staff/admin/errors', label: '시스템 오류', icon: AlertCircle },
    ],
  },
  {
    key: 'setting',
    label: '설정',
    items: [
      { to: '/staff/admin/staff', label: '직원 관리', icon: UserRoundPlus },
      { to: '/staff/admin/schedule', label: '진료 일정', icon: CalendarCheck2 },
      { to: '/staff/admin/questionnaires', label: '문진표 관리', icon: FileText },
      { to: '/staff/admin/settings', label: '병원 설정', icon: Settings },
    ],
  },
  {
    key: 'bot',
    label: '상담봇',
    items: [
      { to: '/staff/bot/knowledge', label: '안내자료', icon: Sparkles },
      { to: '/staff/bot/unresolved', label: '미해결 질문', icon: SealQuestionIcon },
      { to: '/staff/bot/reports', label: '오답 처리함', icon: FlagIcon },
      { to: '/staff/bot/quality', label: '품질 리포트', icon: ConfettiIcon },
      { to: '/staff/bot/overview', label: '상담봇 현황', icon: MessageCircle },
    ],
  },
]

/** 역할별 노출 (SHELL-NAV-02~04): 접수직원=업무만, 의사=진료화면+환자검색, 관리자=4그룹 */
function visibleGroups(role: StaffRole): { doctorConsole: boolean; groups: NavGroup[] } {
  if (role === 'doctor') {
    return {
      doctorConsole: true,
      groups: [{ key: 'work', label: '업무', items: [{ to: '/staff/patients', label: '환자 검색', icon: Search }] }],
    }
  }
  if (role === 'receptionist') {
    return { doctorConsole: false, groups: GROUPS.filter((g) => g.key === 'work') }
  }
  return { doctorConsole: false, groups: GROUPS } // admin
}

function Badge({ n }: { n: number }) {
  if (!n) return null
  return <span className="ml-auto text-xs font-bold text-amber-400 tabular-nums">{n}</span>
}

function Sidebar() {
  const { staff } = useStaff()
  const { doctorConsole, groups } = visibleGroups(staff.role)

  // 직원 콘솔 = 딥틸 잉크 사이드바(업무 도구 정체성). 환자앱은 전부 흰색이라 확실히 구별된다.
  const itemClass = ({ isActive }: { isActive: boolean }) =>
    [
      'group relative flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
      isActive ? 'bg-white/15 font-semibold text-white' : 'text-white/85 hover:bg-white/8 hover:text-white',
    ].join(' ')

  const renderItem = (it: NavItem) => (
    <NavLink key={it.to} to={it.to} className={itemClass} end={it.to === '/staff/today'}>
      {({ isActive }) => (
        <>
          {/* 좌측 3px 바 — 색만으로 구분하지 않는다 (SHELL-NAV-06) */}
          <span
            className={`absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-white transition-opacity ${
              isActive ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <it.icon className="h-[1.1rem] w-[1.1rem] shrink-0" />
          <span className="truncate">{it.label}</span>
          <Badge n={navBadges[it.to] ?? 0} />
        </>
      )}
    </NavLink>
  )

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-[#0a4a4c] text-white">
      {/* 브랜드 (사이드바 top) */}
      <div className="flex h-14 items-center gap-2 px-5">
        <Hospital className="h-6 w-6 text-white" />
        <span className="brand-wordmark text-xl text-white">가온병원</span>
      </div>
      <div className="mx-5 mb-2 border-b border-white/10 pb-3 text-[0.7rem] font-medium text-white/55">
        직원 업무 시스템
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-6 pt-1">
        {doctorConsole && <div className="mb-3">{renderItem(DOCTOR_CONSOLE)}</div>}
        {groups.map((g) => (
          <div key={g.key} className="mt-4 first:mt-1">
            <div className="mb-1 px-3 text-[0.68rem] font-semibold uppercase tracking-wider text-white/55">
              {g.label}
            </div>
            <div className="flex flex-col gap-0.5">{g.items.map(renderItem)}</div>
          </div>
        ))}
      </nav>
    </aside>
  )
}

// 화면 제목 (헤더 좌측) — 사이드바 라벨을 단일 출처로 삼아 모든 화면이 같은 헤더 양식을 쓴다.
const NAV_TITLE: Record<string, string> = (() => {
  const m: Record<string, string> = { [DOCTOR_CONSOLE.to]: DOCTOR_CONSOLE.label }
  for (const g of GROUPS) for (const it of g.items) m[it.to] = it.label
  return m
})()
const EXTRA_TITLE: Record<string, string> = {
  '/staff': '오늘의 현황', // 인덱스
  '/staff/checkin': 'QR·예약번호 접수',
}
function titleFor(path: string): string {
  if (path.startsWith('/staff/patients/')) return '환자 상세'
  return NAV_TITLE[path] ?? EXTRA_TITLE[path] ?? '가온병원 직원 웹'
}

function RoleMenu() {
  const { staff } = useStaff()
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm hover:bg-muted/70"
      >
        <UserRound className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{staff.name}</span>
        <span className="text-muted-foreground">· {ROLE_LABEL[staff.role]}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl bg-card p-3 text-sm shadow-[var(--elevation-card)]">
            <div className="px-1 pb-2 text-[0.7rem] font-semibold text-muted-foreground">내 정보</div>
            <dl className="space-y-1.5 px-1">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">이메일</dt>
                <dd className="truncate">{staff.email}</dd>
              </div>
              {staff.dept && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">진료과</dt>
                  <dd>{staff.dept}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">역할</dt>
                <dd>{ROLE_LABEL[staff.role]}</dd>
              </div>
            </dl>
            <button className="mt-2 flex w-full items-center gap-2 rounded-lg px-1 py-2 text-left hover:bg-muted">
              <LockKeyhole className="h-4 w-4 text-primary" />
              비밀번호 변경
              <span className="ml-auto text-muted-foreground">›</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function Header() {
  const { pathname } = useLocation()
  const { staff } = useStaff()
  const navigate = useNavigate()
  const [confirmOut, setConfirmOut] = useState(false)
  const [checkinOpen, setCheckinOpen] = useState(false)
  const { logout } = useStaff()

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card px-6">
      <h1 className="text-base font-semibold">{titleFor(pathname)}</h1>

      <div className="ml-auto flex items-center gap-3">
        <RoleMenu />
        <button
          onClick={() => setConfirmOut(true)}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          로그아웃
        </button>

        {/* 구분선 + 넓은 여백 뒤 '일 시작' 버튼을 오른쪽 끝에 (SHELL-HDR-05·SHELL-ACT-01).
            의사는 예약을 잡지 않으므로 아예 안 그린다 (SHELL-ACT-03). */}
        {staff.role !== 'doctor' && (
          <>
            <span className="mx-1 h-6 w-px bg-border" />
            <button
              onClick={() => setCheckinOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-card px-3 py-2 text-sm font-medium shadow-[var(--elevation-card)] hover:bg-muted"
            >
              <QrCode className="h-4 w-4 text-primary" />QR 접수
            </button>
            <button className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90">
              <CalendarPlus className="h-4 w-4" />새 예약
            </button>
            <button className="flex items-center gap-1.5 rounded-lg bg-card px-3 py-2 text-sm font-medium shadow-[var(--elevation-card)] hover:bg-muted">
              <UserPlus className="h-4 w-4" />당일 방문
            </button>
          </>
        )}
      </div>

      {checkinOpen && <CheckinPanel onClose={() => setCheckinOpen(false)} />}

      {confirmOut && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-[var(--elevation-card)]">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-bold">로그아웃할까요?</h2>
              <button onClick={() => setConfirmOut(false)} className="rounded-full p-1 hover:bg-muted">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmOut(false)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                취소
              </button>
              <button
                onClick={() => {
                  logout()
                  navigate('/staff/login')
                }}
                className="rounded-lg bg-card px-4 py-2 text-sm font-medium text-muted-foreground shadow-[var(--elevation-card)] hover:bg-muted"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

/** 직원 웹 데스크톱 셸 — 폰 프레임 없이 사이드바 240px + 상단바 + 넓은 본문 */
export function StaffShell() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
