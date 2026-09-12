import { act, render, screen, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, type Mock } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { server } from '../../../test/msw/server'
import { AuthProvider } from '../../../auth/AuthProvider'
import { ConnectivityProvider } from '../../../lib/connectivity'
import { AppShell } from '../../../shell/AppShell'
import type { Role } from '../../../auth/roles'
import type {
  MergeEventData,
  MergeHistoryRow,
  MergeParty,
  MergePreservation,
  MergeUndoStatus,
  UndoResult,
} from '../../../api/mergeHistory'
import { MergeHistoryPage } from './MergeHistoryPage'
import { MergeEventDetail } from './MergeEventDetail'

// ── 공용 테스트 도구 (MHIST-* 병합 되돌림 이력) ─────────────────────────────
// merge/·questionnaires/ 화면과 같은 통합 방식 — 페이지를 통째로 렌더하고 msw로 계약을 흉내 낸다.
// ⛔ 실제 App.tsx를 import하지 않는다: 목록·상세·probe 라우트를 이 하네스가 자족적으로 배선한다.
// 플랜 테스트가 전역 `user`·`location`·`undoApi`… 를 바로 쓰므로(구조분해 없이) ES 모듈의 라이브
// 바인딩으로 노출한다 — 렌더할 때마다 재할당/변형되고 import 쪽에 그대로 비친다.

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = vi.fn()

const RETURN_KEY = 'staff-session-return'

// ── 모듈 싱글턴(라이브 바인딩) ────────────────────────────────────────────
export let user: ReturnType<typeof userEvent.setup>
/** 현재 라우터 위치 — LocationProbe가 매 렌더마다 변형한다(같은 객체 참조 유지). */
export const location = { pathname: '', search: '' }
export let undoApi: Mock
export let mergeCreateApi: Mock
export let notesApi: Mock

// ── 픽스처 빌더 ────────────────────────────────────────────────────────
function party(over: Partial<MergeParty> = {}, name = '홍*동', id = 'p-x'): MergeParty {
  return { patient_id: id, name: name, ...over }
}

interface RowConfig {
  id?: string
  merge_event_id?: string
  merged_at?: string
  executed_by?: string
  status?: MergeUndoStatus
  primary?: Partial<MergeParty>
  merged?: Partial<MergeParty>
}

export function mkRow(over: RowConfig = {}): MergeHistoryRow {
  const mergeEventId = over.merge_event_id ?? over.id ?? 'm1'
  return {
    id: over.id ?? mergeEventId,
    merge_event_id: mergeEventId,
    merged_at: over.merged_at ?? '2026-08-20T14:30:00',
    executed_by: over.executed_by ?? '김관리',
    status: over.status ?? 'undoable',
    primary: party(over.primary, '홍*동', 'p-primary'),
    merged: party(over.merged, '홍*똥', 'p-merged'),
  }
}

interface EventConfig {
  merge_event_id?: string
  merged_at?: string
  executed_by?: string
  undo_status?: MergeUndoStatus
  lock_reason?: string | null
  preservation?: {
    primary?: Record<string, number>
    merged?: Partial<MergePreservation['merged']>
    lineage_active?: boolean
  }
  primary?: Partial<MergeParty>
  merged?: Partial<MergeParty>
}

export function mkEvent(over: EventConfig = {}): MergeEventData {
  const id = over.merge_event_id ?? 'm1'
  return {
    merge_event_id: id,
    merged_at: over.merged_at ?? '2026-08-20T14:30:00',
    executed_by: over.executed_by ?? '김관리',
    undo_status: over.undo_status ?? 'undoable',
    lock_reason: over.lock_reason ?? null,
    preservation: {
      primary: { medical_records: 0, ...over.preservation?.primary },
      merged: {
        appointments: 0,
        questionnaires: 0,
        medical_records: 0,
        access_logs: 0,
        ...over.preservation?.merged,
      },
      lineage_active: over.preservation?.lineage_active ?? true,
    },
    primary: party(over.primary, '홍*동', 'p-primary'),
    merged: party(over.merged, '홍*똥', 'p-merged'),
  }
}

function rowFromEvent(ev: MergeEventData): MergeHistoryRow {
  return {
    id: ev.merge_event_id,
    merge_event_id: ev.merge_event_id,
    merged_at: ev.merged_at,
    executed_by: ev.executed_by,
    status: ev.undo_status,
    primary: { name: ev.primary.name, patient_id: ev.primary.patient_id },
    merged: { name: ev.merged.name, patient_id: ev.merged.patient_id },
  }
}

// ── 상태 기계 백엔드(스테이트풀 mock) ─────────────────────────────────────
export interface RecordedCall {
  method: string
  path: string
  body: unknown
}

interface HarnessState {
  role: Role
  online: boolean
  listRows: MergeHistoryRow[]
  events: Map<string, MergeEventData>
  undoResult: Partial<UndoResult> | null
  calls: RecordedCall[]
  overrides: Map<string, { status: number; detail?: string }>
}

let state: HarnessState
let qc: QueryClient
let renderResult: RenderResult
let currentEntry = ''
let currentShell = false

function pathname(request: Request): string {
  return new URL(request.url).pathname
}
async function bodyOf(request: Request): Promise<unknown> {
  try {
    return await request.clone().json()
  } catch {
    return null
  }
}
function record(method: string, path: string, body: unknown) {
  state.calls.push({ method, path, body })
}
function overrideFor(method: string, path: string) {
  return state.overrides.get(`${method} ${path}`)
}

function installHandlers() {
  server.use(
    http.get('*/admin/merge-history', ({ request }) => {
      const p = pathname(request)
      record('GET', p, null)
      const ov = overrideFor('GET', p)
      if (ov) return HttpResponse.json({ detail: ov.detail ?? '불러오지 못했습니다' }, { status: ov.status })
      return HttpResponse.json({
        rows: state.listRows,
        has_more: false,
        next_cursor: null,
        order: 'merged_at DESC',
      })
    }),
    http.get('*/admin/merge-history/:id', ({ request, params }) => {
      const p = pathname(request)
      record('GET', p, null)
      const ov = overrideFor('GET', p)
      if (ov) return HttpResponse.json({ detail: ov.detail ?? '불러오지 못했습니다' }, { status: ov.status })
      const ev = state.events.get(params.id as string)
      if (!ev) return HttpResponse.json({ detail: '이벤트를 찾지 못했습니다' }, { status: 404 })
      return HttpResponse.json(ev)
    }),
    http.post('*/admin/merge-history/:id/undo', async ({ request, params }) => {
      const id = params.id as string
      const p = pathname(request)
      const body = await bodyOf(request)
      record('POST', p, body)
      undoApi(id, body)
      const ov = overrideFor('POST', p)
      if (ov) return HttpResponse.json({ detail: ov.detail ?? '되돌릴 수 없습니다' }, { status: ov.status })
      const ev = state.events.get(id)
      if (ev) ev.undo_status = 'undone'
      const listed = state.listRows.find((r) => r.merge_event_id === id)
      if (listed) listed.status = 'undone'
      return HttpResponse.json({ status: 'undone', merge_event_id: id, ...state.undoResult })
    }),
    http.post('*/patients/:id/notes', async ({ request, params }) => {
      const p = pathname(request)
      const body = await bodyOf(request)
      record('POST', p, body)
      notesApi(params.id as string, body)
      const ov = overrideFor('POST', p)
      if (ov) return HttpResponse.json({ detail: ov.detail ?? '저장하지 못했습니다' }, { status: ov.status })
      return HttpResponse.json({ id: 'note-1' }, { status: 201 })
    }),
    // 되돌림이 새 병합을 만들지 않는지 감시하는 창구(MHIST-REASON-02). 되돌림 흐름은 이걸 부르면 안 된다.
    http.post('*/admin/merge-candidates/merge', async ({ request }) => {
      const body = await bodyOf(request)
      record('POST', pathname(request), body)
      mergeCreateApi(body)
      return HttpResponse.json({ merge_id: 'merge-x', account_link_moved: false })
    }),
  )
}

export const api = {
  calls(match: string | RegExp): RecordedCall[] {
    return state.calls.filter((c) => {
      const label = `${c.method} ${c.path}`
      return typeof match === 'string' ? label.includes(match) : match.test(label)
    })
  },
  writeCalls(): RecordedCall[] {
    return state.calls.filter((c) => c.method !== 'GET')
  },
  respond(key: string, status: number, detail?: string) {
    state.overrides.set(key, { status, detail })
  },
}

// ── 렌더 하네스 ────────────────────────────────────────────────────────
interface SetupConfig {
  initialEntry: string
  withShell?: boolean
  role?: Role
  online?: boolean
  listRows: MergeHistoryRow[]
  events: MergeEventData[]
  undoResult?: Partial<UndoResult> | null
}

function baseRender(config: SetupConfig) {
  state = {
    role: config.role ?? 'admin',
    online: config.online ?? true,
    listRows: config.listRows,
    events: new Map(config.events.map((e) => [e.merge_event_id, e])),
    undoResult: config.undoResult ?? null,
    calls: [],
    overrides: new Map(),
  }

  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => state.online,
  })

  installHandlers()

  undoApi = vi.fn()
  mergeCreateApi = vi.fn()
  notesApi = vi.fn()
  user = userEvent.setup()

  qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })
  // 동기 첫 렌더를 위해 캐시를 시드한다 — 플랜 테스트는 렌더 직후 데이터를 동기로 읽는다.
  seedCache()

  currentEntry = config.initialEntry
  currentShell = config.withShell ?? false
  renderResult = render(<Providers entry={currentEntry} withShell={currentShell} />)
}

function seedCache() {
  qc.setQueryData(['merge-history'], {
    pages: [{ rows: state.listRows, has_more: false, next_cursor: null, order: 'merged_at DESC' }],
    pageParams: [null],
  })
  for (const ev of state.events.values()) {
    qc.setQueryData(['merge-event', ev.merge_event_id], ev)
  }
}

const STAFF_BY_ROLE: Record<Role, { staffId: string; name: string }> = {
  admin: { staffId: 's-001', name: '김관리' },
  receptionist: { staffId: 's-002', name: '박접수' },
  doctor: { staffId: 's-003', name: '이의사' },
}

function Providers({ entry, withShell }: { entry: string; withShell: boolean }) {
  const who = STAFF_BY_ROLE[state.role]
  const staffProfile = {
    staffId: who.staffId,
    name: who.name,
    email: `${who.staffId}@lunahospital.test`,
    role: state.role,
    departmentId: null,
    departmentName: null,
  }
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter
        initialEntries={[entry]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ConnectivityProvider>
          <AuthProvider initialAuth={{ session: { access_token: 't' }, staff: staffProfile }}>
            <LocationProbe />
            <AppRoutes withShell={withShell} />
          </AuthProvider>
        </ConnectivityProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function LocationProbe() {
  const loc = useLocation()
  location.pathname = loc.pathname
  location.search = loc.search
  return null
}

function Probe({ label }: { label: string }) {
  return <div>{label}</div>
}

function AppRoutes({ withShell }: { withShell: boolean }) {
  const inner = (
    <>
      <Route path="/today" element={<Probe label="오늘의 현황" />} />
      <Route path="/queue" element={<Probe label="대기 목록" />} />
      <Route path="/patients" element={<Probe label="환자 검색" />} />
      <Route path="/patients/:id" element={<Probe label="환자 상세" />} />
      <Route path="/admin/patient-merge-candidates" element={<Probe label="중복 환자" />} />
      <Route path="/admin/merge-history" element={<MergeHistoryPage />} />
      <Route path="/admin/merge-history/:mergeEventId" element={<MergeEventDetail />} />
    </>
  )
  return (
    <Routes>
      <Route path="/login" element={<Probe label="로그인" />} />
      {withShell ? <Route element={<AppShell />}>{inner}</Route> : inner}
    </Routes>
  )
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

// ── 진입점 ────────────────────────────────────────────────────────────
export function renderApp(config: { route: string; role?: Role }) {
  baseRender({
    initialEntry: config.route,
    withShell: true,
    role: config.role,
    listRows: [mkRow({ merge_event_id: 'm1' })],
    events: [mkEvent({ merge_event_id: 'm1' })],
  })
}

export function renderMergeHistory(config: { rows?: RowConfig[]; count?: number } = {}) {
  const rows = config.rows ? config.rows.map((r) => mkRow(r)) : [mkRow({ merge_event_id: 'm1' })]
  baseRender({ initialEntry: '/admin/merge-history', listRows: rows, events: [] })
}

export function renderEvent(config: EventConfig & { online?: boolean; result?: Partial<UndoResult> } = {}) {
  const ev = mkEvent(config)
  baseRender({
    initialEntry: `/admin/merge-history/${ev.merge_event_id}`,
    online: config.online,
    undoResult: config.result ?? null,
    listRows: [rowFromEvent(ev)],
    events: [ev],
  })
}

export async function reload() {
  const path = location.pathname || currentEntry
  renderResult.unmount()
  renderResult = render(<Providers entry={path} withShell={currentShell} />)
  await flush()
}

// ── 질의 헬퍼 ──────────────────────────────────────────────────────────
export function sidebarActive(): string | null {
  const el = document.querySelector('.staff-sidebar [aria-current="page"]')
  return el?.getAttribute('aria-label') ?? el?.textContent?.trim() ?? null
}

export function listApiCall(): RecordedCall | undefined {
  return state.calls.find((c) => c.method === 'GET' && c.path === '/admin/merge-history')
}

export function row(sel: number | string): HTMLElement {
  const rows = Array.from(document.querySelectorAll('[data-row]')) as HTMLElement[]
  const el =
    typeof sel === 'number'
      ? rows[sel]
      : rows.find((r) => r.getAttribute('data-merge-event-id') === sel)
  if (!el) throw new Error(`이력 행을 찾지 못함: ${sel}`)
  return el
}

export function reviewButton(): HTMLElement {
  return screen.getByRole('button', { name: '되돌림 검토' })
}
export function continueButton(): HTMLElement {
  return screen.getByRole('button', { name: '확인으로 계속' })
}
export function reasonBox(): HTMLElement {
  return screen.getByLabelText('되돌림 사유')
}
export function memoBox(): HTMLElement {
  return screen.getByLabelText('감사메모')
}

export function returnTo(): string | null {
  try {
    const raw = sessionStorage.getItem(RETURN_KEY)
    return raw ? (JSON.parse(raw) as { path?: string }).path ?? null : null
  } catch {
    return null
  }
}

// ── 흐름 헬퍼 (단계 경계를 넘나든다) ───────────────────────────────────────
function detailMounted(): boolean {
  return !!document.querySelector('[data-merge-event-detail]')
}

/** 상세(되돌림 가능) → 사유 → 확인창. 이미 렌더돼 있으면 다시 렌더하지 않는다. */
export async function openConfirm({ reason = '본인 아님', checked = false }: { reason?: string; checked?: boolean } = {}) {
  if (!detailMounted()) renderEvent({ undo_status: 'undoable' })
  if (!screen.queryByRole('button', { name: '되돌림 확정' })) {
    await user.click(await screen.findByRole('button', { name: '되돌림 검토' }))
    await user.type(reasonBox(), reason)
    await user.click(screen.getByRole('button', { name: '확인으로 계속' }))
  }
  if (checked) {
    await user.click(screen.getByRole('checkbox', { name: /읽었습니다/ }))
  }
}

/** 확인창까지 연 뒤 [되돌림 확정]을 누른다. */
export async function confirmUndo({
  reason = 'x',
  checked = true,
  result,
}: { reason?: string; checked?: boolean; result?: Partial<UndoResult> } = {}) {
  if (!detailMounted()) renderEvent({ undo_status: 'undoable', result })
  else if (result) state.undoResult = result
  await openConfirm({ reason, checked })
  await user.click(screen.getByRole('button', { name: '되돌림 확정' }))
}
