import { useEffect, useRef, useState, type ComponentType } from 'react'
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
  Eye,
  EyeOff,
  CheckCircle2,
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
import { ROLE_LABEL, navBadges, type StaffRole } from './mockData'
import { btnGhost, btnPrimary } from './_ui'
import { useStaff } from './staffState'
import { DoorProvider, useDoors } from './doors/DoorContext'
import { DoorRegion } from './doors/panels'
import { workSurfaceFor } from './doors/surfaces'

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
      { to: '/staff/tickets', label: '상담봇 문의함', icon: MessageCircle },
      { to: '/staff/messages', label: '안내 보내기', icon: Send },
    ],
  },
  {
    key: 'record',
    label: '기록',
    items: [
      { to: '/staff/admin/stats', label: '운영 통계', icon: BarChart3 },
      { to: '/staff/admin/access-logs', label: '접근 기록', icon: ShieldCheck },
      // 상담봇 기록 = 상담봇이 나눈 대화(앱+웹, 일부 직원 연결)를 감독·조회하는 읽기 화면. 티켓함=처리는 업무 그룹에 남는다.
      { to: '/staff/chatlog', label: '상담봇 기록', icon: ClipboardList },
      { to: '/staff/admin/patient-merge-candidates', label: '중복 환자', icon: Layers3 },
      { to: '/staff/admin/merge-history', label: '병합 이력', icon: History },
      { to: '/staff/admin/errors', label: '시스템 오류', icon: AlertCircle },
    ],
  },
  {
    key: 'bot',
    label: '상담봇 관리',
    items: [
      { to: '/staff/bot/knowledge', label: '안내자료', icon: Sparkles },
      { to: '/staff/bot/unresolved', label: '미해결 질문', icon: SealQuestionIcon },
      { to: '/staff/bot/reports', label: '오답 처리함', icon: FlagIcon },
      { to: '/staff/bot/quality', label: '품질 리포트', icon: ConfettiIcon },
      { to: '/staff/bot/overview', label: '상담봇 현황', icon: MessageCircle },
    ],
  },
  // 설정은 맨 아래 — 매일 여는 화면이 아니라 가끔 손보는 관리 항목이라 시선의 끝에 둔다(사용자 지시 2026-08-23).
  {
    key: 'setting',
    label: '설정',
    items: [
      { to: '/staff/admin/staff', label: '직원 관리', icon: UserRoundPlus },
      { to: '/staff/admin/schedule', label: '진료 일정 관리', icon: CalendarCheck2 },
      { to: '/staff/admin/questionnaires', label: '문진표 관리', icon: FileText },
      { to: '/staff/admin/settings', label: '병원 설정', icon: Settings },
    ],
  },
]

/** 역할별 노출 (SHELL-NAV-02~04): 접수직원=업무만, 의사=진료화면+환자검색, 관리자=4그룹 */
function visibleGroups(role: StaffRole): { doctorConsole: boolean; groups: NavGroup[] } {
  if (role === 'doctor') {
    // 의사는 진료 화면 + 환자 검색 2개뿐(SHELL-NAV-03) — 카테고리 라벨을 두지 않는다(항목이 둘뿐이라 군더더기)
    return {
      doctorConsole: true,
      groups: [{ key: 'work', label: '', items: [{ to: '/staff/patients', label: '환자 검색', icon: Search }] }],
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
            {g.label && (
              <div className="mb-1 px-3 text-[0.68rem] font-semibold uppercase tracking-wider text-white/55">
                {g.label}
              </div>
            )}
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
  const [pwOpen, setPwOpen] = useState(false)
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
            <button
              className="mt-2 flex w-full items-center gap-2 rounded-lg px-1 py-2 text-left hover:bg-muted"
              onClick={() => { setPwOpen(true); setOpen(false) }}
            >
              <LockKeyhole className="h-4 w-4 text-primary" />
              비밀번호 변경
              <span className="ml-auto text-muted-foreground">›</span>
            </button>
          </div>
        </>
      )}
      {pwOpen && <PasswordPanel onClose={() => setPwOpen(false)} />}
    </div>
  )
}

// 비밀번호 변경 = 오른쪽 패널 (SHELL-ME-03·SHELL-PW-02) — 화면을 옮기지 않는다
function PasswordPanel({ onClose }: { onClose: () => void }) {
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [done, setDone] = useState(false)
  const long = pw.length >= 8
  const hasNum = /\d/.test(pw) && /[a-zA-Z]/.test(pw)
  const match = pw.length > 0 && pw === confirm
  const ready = long && hasNum && match
  const inputCls = 'h-10 w-full rounded-lg border border-input bg-card px-3 pr-10 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40'
  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="fixed inset-0 bg-foreground/20" />
      <aside className="relative z-10 flex h-full w-[380px] flex-col bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h3 className="flex items-center gap-1.5 text-sm font-bold"><LockKeyhole className="h-4 w-4 text-primary" /> 비밀번호 변경</h3>
          <button onClick={onClose} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" /> 닫기
          </button>
        </div>
        {done ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            <p className="text-sm font-medium">비밀번호를 바꿨습니다.</p>
            <button className={`${btnGhost} mt-2`} onClick={onClose}>닫기</button>
          </div>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">새 비밀번호</label>
              <div className="relative">
                <input type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} />
                <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label={show ? '숨기기' : '보기'}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">새 비밀번호 확인</label>
              <div className="relative">
                <input type={show ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
              </div>
            </div>
            <ul className="space-y-1 text-xs">
              <Cond ok={long}>8자 이상</Cond>
              <Cond ok={hasNum}>영문과 숫자를 함께</Cond>
              <Cond ok={match}>두 입력이 같음</Cond>
            </ul>
            <button className={`${btnPrimary} w-full justify-center disabled:opacity-50`} disabled={!ready} onClick={() => setDone(true)}>비밀번호 변경</button>
          </div>
        )}
      </aside>
    </div>
  )
}

function Cond({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-1.5 ${ok ? 'text-emerald-700' : 'text-muted-foreground'}`}>
      <CheckCircle2 className={`h-3.5 w-3.5 ${ok ? 'text-emerald-600' : 'text-muted-foreground/40'}`} />
      {children}
    </li>
  )
}

function Header() {
  const { pathname } = useLocation()
  const { staff } = useStaff()
  const navigate = useNavigate()
  const [confirmOut, setConfirmOut] = useState(false)
  const { logout } = useStaff()
  const { open } = useDoors()

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card px-6">
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

        {/* 세 문 — 예약 / 등록 / 접수 (F-4). 일반 병원 창구 순서 그대로 나란히.
            어느 화면에 있든 오른쪽 끝 같은 자리(SHELL-ACT-01~02) · 누르면 화면을 옮기지 않고 패널만(SHELL-ACT-04).
            의사는 예약을 잡지 않으므로 아예 안 그린다(SHELL-ACT-03). */}
        {staff.role !== 'doctor' && (
          <>
            <span className="mx-1 h-6 w-px bg-border" />
            <button
              onClick={() => open('register')}
              className="flex items-center gap-1.5 rounded-lg bg-card px-3 py-2 text-sm font-medium shadow-[var(--elevation-card)] hover:bg-muted"
            >
              <UserPlus className="h-4 w-4 text-primary" />등록
            </button>
            {/* 가운데 = 접수(창구에서 가장 자주 하는 일)만 깊은 색으로 도드라지게, 양쪽은 옅은 색 */}
            <button
              onClick={() => open('checkin')}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              <QrCode className="h-4 w-4" />접수
            </button>
            <button
              onClick={() => open('reserve')}
              className="flex items-center gap-1.5 rounded-lg bg-card px-3 py-2 text-sm font-medium shadow-[var(--elevation-card)] hover:bg-muted"
            >
              <CalendarPlus className="h-4 w-4 text-primary" />예약
            </button>
          </>
        )}
      </div>

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

/** 본문 영역 — 문이 열려 어떤 칸을 채우는 중이면 왼쪽이 그 도구로 바뀌고(PANEL-WORK-01),
 *  아니면 보던 화면이 그대로 있되 패널이 열린 동안은 읽기 전용이 된다(PANEL-BACK-01). */
function MainRegion() {
  const { openDoor, activeField, draft, collapsed, setField } = useDoors()
  const { pathname } = useLocation()
  const prev = useRef(pathname)

  // 문이 열린 채 사이드바로 다른 화면에 가면 → 왼쪽 도구를 접고 그 화면을 보여준다.
  // 패널은 살아남아 따라온다(PANEL-LIVE-01). 칸을 다시 누르면 도구가 돌아온다.
  useEffect(() => {
    if (prev.current !== pathname) {
      prev.current = pathname
      if (openDoor && activeField) setField(null)
    }
  }, [pathname, openDoor, activeField, setField])

  const surface = openDoor && !collapsed ? workSurfaceFor(openDoor, activeField, !!draft.doctor, !!draft.patient) : null
  if (surface) {
    return <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{surface}</main>
  }
  // 도구가 없으면 보던 화면 그대로 — 문이 열려 있어도 자유롭게 보고 이동할 수 있다(PANEL-BACK-02).
  return (
    <main className="relative min-h-0 flex-1 overflow-y-auto">
      <Outlet />
    </main>
  )
}

function ShellBody() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <div className="flex min-h-0 flex-1">
          <MainRegion />
          <DoorRegion />
        </div>
      </div>
    </div>
  )
}

/** 직원 웹 데스크톱 셸 — 폰 프레임 없이 사이드바 240px + 상단바 + 넓은 본문 */
export function StaffShell() {
  return (
    <DoorProvider>
      <ShellBody />
    </DoorProvider>
  )
}
