import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { server } from '../../../test/msw/server'
import { AuthProvider } from '../../../auth/AuthProvider'
import { Sidebar } from '../../../shell/Sidebar'
import { StaffAdminPage } from './StaffAdminPage'
import type { Department, DeactivationImpact, StaffMember } from '../../../api/staff'
import type { Role } from '../../../auth/roles'

// ── 공용 테스트 도구 ─────────────────────────────────────────────
// 6개 테스트 파일이 같은 픽스처·같은 질의 헬퍼를 쓴다(플랜 Step 6의 pseudo 헬퍼를 실물로).
// StaffAdminPage를 통째로 렌더하는 통합 방식 — rowOf·openProfile 같은 헬퍼가
// 컴포넌트 경계를 넘나들기 때문이다(플랜 헬퍼가 이미 그렇게 되어 있다).

export interface RecordedCall {
  method: string
  path: string
  body: unknown
}

function s(
  id: string,
  name: string,
  role: Role,
  over: Partial<StaffMember> = {},
): StaffMember {
  return {
    id,
    name,
    role,
    department_id: null,
    is_active: true,
    specialty: null,
    bio: null,
    photo_url: null,
    calendar_color_index: role === 'doctor' ? 0 : null,
    last_sign_in_at: null,
    invited_at: null,
    ...over,
  }
}

// 기본 픽스처 — 현재 로그인 = 관리자 s-001(김관리). 시각 기준은 vi.setSystemTime로 고정한다.
export const DEP_IM = 'dep-im'
export const DEP_OS = 'dep-os'

export function defaultStaff(): StaffMember[] {
  return [
    s('s-001', '김관리', 'admin', { last_sign_in_at: '2026-08-27T08:50:00+09:00' }),
    s('s-002', '이민호', 'doctor', {
      department_id: DEP_IM,
      specialty: '내과',
      photo_url: 'https://x/p.jpg',
      calendar_color_index: 0,
      last_sign_in_at: '2026-08-27T08:57:00+09:00',
    }),
    s('s-003', '박접수', 'receptionist', { last_sign_in_at: '2026-08-27T09:00:00+09:00' }),
    s('s-004', '최운영', 'admin', { last_sign_in_at: '2026-08-26T17:26:00+09:00' }),
    s('s-005', '서하늘', 'doctor', {
      is_active: false,
      department_id: DEP_OS,
      calendar_color_index: 2,
      last_sign_in_at: '2026-08-20T10:00:00+09:00',
    }),
    s('s-006', '김의사', 'doctor', {
      department_id: DEP_IM,
      calendar_color_index: 1,
      last_sign_in_at: null,
      invited_at: '2026-08-14T02:00:00+09:00',
    }),
    s('s-007', '한서윤', 'doctor', {
      department_id: DEP_OS,
      calendar_color_index: 3,
      last_sign_in_at: '2026-08-27T08:10:00+09:00',
    }),
  ]
}

export function defaultDepartments(): Department[] {
  // 사용 중인 진료과만 내려온다(include_inactive=false) — 폐과된과는 없다(STAFF-INVITE-03).
  return [
    { id: DEP_IM, name: '내과', is_active: true },
    { id: DEP_OS, name: '정형외과', is_active: true },
  ]
}

export interface SetupConfig {
  staff?: StaffMember[]
  departments?: Department[]
  impact?: DeactivationImpact
  /** [STAFF-DEACT-09] 409 뒤 [다시 확인]이 다시 읽을 때 돌려줄 최신 미리보기. */
  impactAfterConflict?: DeactivationImpact
  role?: Role
  path?: string
}

export interface Api {
  calls(match: string | RegExp): RecordedCall[]
  lastCall(): string
  lastBody(): unknown
  fail(key: string): void
  respond(key: string, status: number, detail?: string): void
}

// jsdom엔 레이아웃이 없어 scrollIntoView가 없다 — InlineError가 자리로 스크롤하려다 죽지 않게 스텁한다.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = vi.fn()

function pathname(request: Request): string {
  return new URL(request.url).pathname
}

export function setupStaff(config: SetupConfig = {}) {
  const state = {
    staff: (config.staff ?? defaultStaff()).map((m) => ({ ...m })),
    departments: config.departments ?? defaultDepartments(),
    impact: config.impact ?? { count: 0, times: [], version: 'v0' },
    impactAfterConflict: config.impactAfterConflict,
    conflicted: false,
    calls: [] as RecordedCall[],
    fails: new Set<string>(),
    overrides: new Map<string, { status: number; detail?: string }>(),
  }

  function record(method: string, path: string, body: unknown) {
    state.calls.push({ method, path, body })
  }

  function overrideFor(method: string, path: string) {
    return state.overrides.get(`${method} ${path}`)
  }
  function shouldFail(method: string, path: string) {
    return state.fails.has(`${method} ${path}`) || state.fails.has(path)
  }

  async function readBody(request: Request): Promise<unknown> {
    try {
      const type = request.headers.get('content-type') ?? ''
      if (type.includes('application/json')) return await request.clone().json()
      return null
    } catch {
      return null
    }
  }

  server.use(
    http.get('*/staff', ({ request }) => {
      const p = pathname(request)
      record('GET', p, null)
      if (shouldFail('GET', p)) return HttpResponse.json({ detail: '불러오지 못했습니다' }, { status: 500 })
      return HttpResponse.json(state.staff)
    }),
    http.get('*/admin/departments', ({ request }) => {
      record('GET', pathname(request), null)
      return HttpResponse.json(state.departments)
    }),
    http.get('*/staff/:id/deactivation-impact', ({ request }) => {
      record('GET', pathname(request), null)
      const impact = state.conflicted && state.impactAfterConflict ? state.impactAfterConflict : state.impact
      return HttpResponse.json(impact)
    }),
    http.post('*/staff/:id/resend-invite', async ({ request }) => {
      const p = pathname(request)
      record('POST', p, await readBody(request))
      return HttpResponse.json({ status: 'resent' })
    }),
    http.post('*/staff', async ({ request }) => {
      const p = pathname(request)
      const body = (await readBody(request)) as { email: string; name: string; role: Role; department_id: string | null } | null
      record('POST', p, body)
      if (shouldFail('POST', p)) return HttpResponse.json({ detail: '초대에 실패했습니다' }, { status: 500 })
      const id = `s-new-${state.staff.length}`
      if (body) {
        state.staff.push(
          s(id, body.name, body.role, {
            department_id: body.department_id,
            calendar_color_index: body.role === 'doctor' ? 4 : null,
            last_sign_in_at: null,
            invited_at: '2026-08-27T00:00:00+09:00',
          }),
        )
      }
      return HttpResponse.json({ staff_id: id })
    }),
    http.patch('*/staff/:id/profile', async ({ request, params }) => {
      const p = pathname(request)
      const body = (await readBody(request)) as Record<string, unknown> | null
      record('PATCH', p, body)
      const ov = overrideFor('PATCH', p)
      if (ov) return HttpResponse.json(ov.detail ? { detail: ov.detail } : {}, { status: ov.status })
      if (shouldFail('PATCH', p)) return HttpResponse.json({ detail: '저장하지 못했습니다' }, { status: 500 })
      const member = state.staff.find((m) => m.id === params.id)
      if (member && body) Object.assign(member, body)
      return HttpResponse.json({ status: 'updated' })
    }),
    http.post('*/staff/:id/photo', ({ request, params }) => {
      const p = pathname(request)
      record('POST', p, null)
      const url = `https://x/${params.id}.jpg`
      const member = state.staff.find((m) => m.id === params.id)
      if (member) member.photo_url = url
      return HttpResponse.json({ photo_url: url })
    }),
    http.delete('*/staff/:id/photo', ({ request, params }) => {
      const p = pathname(request)
      record('DELETE', p, null)
      const member = state.staff.find((m) => m.id === params.id)
      if (member) member.photo_url = null
      return HttpResponse.json({ status: 'deleted' })
    }),
    http.patch('*/staff/:id/deactivate', async ({ request, params }) => {
      const p = pathname(request)
      record('PATCH', p, await readBody(request))
      const ov = overrideFor('PATCH', p)
      if (ov) {
        if (ov.status === 409) state.conflicted = true
        return HttpResponse.json(ov.detail ? { detail: ov.detail } : {}, { status: ov.status })
      }
      const member = state.staff.find((m) => m.id === params.id)
      if (member) member.is_active = false
      return HttpResponse.json({ status: 'deactivated' })
    }),
  )

  const api: Api = {
    calls(match) {
      return state.calls.filter((c) => {
        const label = `${c.method} ${c.path}`
        return typeof match === 'string' ? label.includes(match) || c.path.includes(match) : match.test(label)
      })
    },
    lastCall() {
      const c = state.calls[state.calls.length - 1]
      return c ? `${c.method} ${c.path}` : ''
    },
    lastBody() {
      return state.calls[state.calls.length - 1]?.body
    },
    fail(key) {
      state.fails.add(key)
    },
    respond(key, status, detail) {
      state.overrides.set(key, { status, detail })
    },
  }

  const user = userEvent.setup()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const role = config.role ?? 'admin'
  const staffProfile = {
    staffId: 's-001',
    name: '김관리',
    email: 'admin@lunahospital.test',
    role,
    departmentId: null,
    departmentName: null,
  }

  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter
        initialEntries={[config.path ?? '/admin/staff']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AuthProvider initialAuth={{ session: { access_token: 't' }, staff: staffProfile }}>
          {role === 'admin' && <Sidebar role="admin" />}
          <Routes>
            <Route path="/admin/staff" element={<StaffAdminPage />} />
            <Route path="/today" element={<LocationProbe label="오늘의 현황" />} />
            <Route path="/login" element={<LocationProbe label="로그인" />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  const refetchList = () => qc.invalidateQueries({ queryKey: ['staff'] })

  return { user, api, state, refetchList }
}

function LocationProbe({ label }: { label: string }) {
  const loc = useLocation()
  return <div data-location={loc.pathname}>{label}</div>
}

// ── 질의 헬퍼 ────────────────────────────────────────────────
export function leftColumn(): HTMLElement {
  return document.querySelector('[data-col="left"]') as HTMLElement
}
export function rightColumn(): HTMLElement {
  return document.querySelector('[data-col="right"]') as HTMLElement
}
export function rowOf(name: string): HTMLElement {
  const rows = Array.from(document.querySelectorAll('[data-staff-row]')) as HTMLElement[]
  const found = rows.find((r) => r.textContent?.includes(name))
  if (!found) throw new Error(`직원 행을 찾지 못함: ${name}`)
  return found
}
export function rowNames(): string[] {
  return (Array.from(document.querySelectorAll('[data-staff-row]')) as HTMLElement[]).map(
    (r) => r.getAttribute('data-row-name') ?? '',
  )
}
export function filterChips(): string[] {
  return (Array.from(document.querySelectorAll('[data-filter-chip]')) as HTMLElement[]).map(
    (c) => c.textContent ?? '',
  )
}
export function chip(label: string): HTMLElement {
  const chips = Array.from(document.querySelectorAll('[data-filter-chip]')) as HTMLElement[]
  const found = chips.find((c) => c.textContent === label)
  if (!found) throw new Error(`필터 칩을 찾지 못함: ${label}`)
  return found
}
export function dialog(): HTMLElement {
  return screen.getByRole('dialog')
}
export function location(): string {
  return document.querySelector('[data-location]')?.getAttribute('data-location') ?? ''
}
export function sidebarActive(): string {
  const el = document.querySelector('.staff-sidebar [aria-current="page"] .nav-label')
  return el?.textContent ?? ''
}

export async function openProfile(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
  await user.click(within(rowOf(name)).getByRole('button', { name: '프로필' }))
}
