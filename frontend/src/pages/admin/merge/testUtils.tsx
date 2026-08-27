import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse, delay } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { server } from '../../../test/msw/server'
import { AuthProvider } from '../../../auth/AuthProvider'
import { ConnectivityProvider } from '../../../lib/connectivity'
import { MergeCandidatesPage } from './MergeCandidatesPage'
import type { CandidateGroup, CandidateRow, Counts } from '../../../api/patientMerge'
import type { Role } from '../../../auth/roles'

// ── 공용 테스트 도구 (MERGE-* 3단계 화면) ──────────────────────────────
// 세 테스트 파일이 같은 픽스처·같은 헬퍼를 쓴다. 페이지를 통째로 렌더하는 통합 방식 —
// 목록 → 비교 → 확인창이 한 상태기계라 헬퍼가 단계 경계를 넘나든다.

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = vi.fn()

const MASK_BIRTH = '1990-**-14'
const MASK_PHONE = '010-****-7251'

function counts(over: Partial<Counts> = {}): Counts {
  return { appointments: 2, questionnaires: 1, medical_records: 3, access_logs: 4, ...over }
}

export function mkRow(id: string, over: Partial<CandidateRow> = {}): CandidateRow {
  return {
    patient_id: id,
    name: '김민서',
    masked_birth_date: MASK_BIRTH,
    masked_phone: MASK_PHONE,
    account_linked: false,
    is_primary: null,
    counts: counts(),
    last_visit_at: null,
    ...over,
  }
}

/** 두 행 후보 그룹. A가 기록이 더 많다(정렬·권고 검증용). bothLinked면 둘 다 계정 연결. */
export function twoRowGroup(opts: { bothLinked?: boolean } = {}): CandidateGroup {
  const a = mkRow('p-a', {
    name: '김민서',
    account_linked: opts.bothLinked ?? false,
    counts: counts({ appointments: 2, questionnaires: 1, medical_records: 3, access_logs: 4 }),
    last_visit_at: '2026-08-20T09:00:00',
  })
  const b = mkRow('p-b', {
    name: '김민서',
    account_linked: opts.bothLinked ?? false,
    counts: counts({ appointments: 1, questionnaires: 0, medical_records: 1, access_logs: 2 }),
    last_visit_at: null,
  })
  return { key: `김민서·${MASK_BIRTH}·${MASK_PHONE}`, rows: [a, b] }
}

export function defaultGroups(): CandidateGroup[] {
  return [twoRowGroup()]
}

export interface RecordedCall {
  method: string
  path: string
  body: unknown
}

export interface SetupConfig {
  role?: Role
  groups?: CandidateGroup[]
  online?: boolean
}

function pathname(request: Request): string {
  return new URL(request.url).pathname
}

export function renderMerge(config: SetupConfig = {}) {
  const state = {
    groups: config.groups ?? defaultGroups(),
    calls: [] as RecordedCall[],
    overrides: new Map<string, { status: number; detail?: string }>(),
    paused: false,
  }

  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => config.online ?? true,
  })

  function record(method: string, path: string, body: unknown) {
    state.calls.push({ method, path, body })
  }
  function overrideFor(method: string, path: string) {
    return state.overrides.get(`${method} ${path}`)
  }

  server.use(
    http.get('*/admin/merge-candidates', async ({ request }) => {
      const p = pathname(request)
      record('GET', p, null)
      if (state.paused) await delay('infinite')
      const ov = overrideFor('GET', p)
      if (ov) return HttpResponse.json({ detail: ov.detail ?? '불러오지 못했습니다' }, { status: ov.status })
      return HttpResponse.json(state.groups)
    }),
    http.post('*/admin/merge-candidates/merge', async ({ request }) => {
      const p = pathname(request)
      let body: unknown = null
      try {
        body = await request.clone().json()
      } catch {
        body = null
      }
      record('POST', p, body)
      const ov = overrideFor('POST', p)
      if (ov) return HttpResponse.json({ detail: ov.detail }, { status: ov.status })
      return HttpResponse.json({ merge_id: 'merge-0001', account_link_moved: false })
    }),
  )

  const api = {
    calls(match: string | RegExp): RecordedCall[] {
      return state.calls.filter((c) => {
        const label = `${c.method} ${c.path}`
        return typeof match === 'string' ? label.includes(match) : match.test(label)
      })
    },
    /** 서버에 상태를 남기는 호출만(POST/PATCH/PUT/DELETE) — 「아직 아무것도 안 바뀌었다」 검증용. */
    writeCalls(): RecordedCall[] {
      return state.calls.filter((c) => c.method !== 'GET')
    },
    lastCall(match: string): RecordedCall | undefined {
      return [...state.calls].reverse().find((c) => `${c.method} ${c.path}`.includes(match))
    },
    respond(key: string, status: number, detail?: string) {
      state.overrides.set(key, { status, detail })
    },
    pauseCandidates() {
      state.paused = true
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
        initialEntries={['/admin/patient-merge-candidates']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ConnectivityProvider>
          <AuthProvider initialAuth={{ session: { access_token: 't' }, staff: staffProfile }}>
            <Routes>
              <Route path="/admin/patient-merge-candidates" element={<MergeCandidatesPage />} />
              <Route path="/patients" element={<Probe label="환자 검색" />} />
              <Route path="/admin/merge-history" element={<Probe label="병합 이력" />} />
              <Route path="/today" element={<Probe label="오늘의 현황" />} />
              <Route path="/login" element={<Probe label="로그인" />} />
            </Routes>
          </AuthProvider>
        </ConnectivityProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  return { user, api, state }
}

function Probe({ label }: { label: string }) {
  const loc = useLocation()
  return <div data-location={loc.pathname}>{label}</div>
}

// ── 질의 헬퍼 ────────────────────────────────────────────────
export function routerPath(): string {
  return document.querySelector('[data-location]')?.getAttribute('data-location') ?? ''
}
export function groupCard(index: number): HTMLElement {
  const cards = Array.from(document.querySelectorAll('[data-group-card]')) as HTMLElement[]
  const el = cards[index]
  if (!el) throw new Error(`후보 그룹 카드를 찾지 못함: ${index}`)
  return el
}
export function candidateRows(card: HTMLElement): HTMLElement[] {
  return Array.from(card.querySelectorAll('[data-candidate-row]')) as HTMLElement[]
}
export function compare(): HTMLElement {
  return document.querySelector('[data-compare]') as HTMLElement
}
export function compareCard(side: string): HTMLElement {
  const el = document.querySelector(`[data-compare-card][data-side="${side}"]`) as HTMLElement
  if (!el) throw new Error(`비교 카드를 찾지 못함: ${side}`)
  return el
}
export function leftCard(): HTMLElement {
  return compareCard('좌')
}
export function rightCard(): HTMLElement {
  return compareCard('우')
}
export function itemLabels(card: HTMLElement): string[] {
  return (Array.from(card.querySelectorAll('[data-item]')) as HTMLElement[]).map(
    (el) => el.getAttribute('data-item-label') ?? '',
  )
}
export function dialogItemLabels(): string[] {
  return (Array.from(document.querySelectorAll('[data-dialog-item]')) as HTMLElement[]).map(
    (el) => el.getAttribute('data-dialog-label') ?? '',
  )
}
export function dangerButtons(scope?: HTMLElement): HTMLElement[] {
  const root = scope ?? document.body
  return Array.from(root.querySelectorAll('[data-testid="danger"]')) as HTMLElement[]
}
export function badges(card: HTMLElement): string[] {
  return (Array.from(card.querySelectorAll('[data-badge]')) as HTMLElement[]).map((el) => el.textContent ?? '')
}

type User = ReturnType<typeof userEvent.setup>

/** 목록에서 첫 그룹의 첫 [대표로 검토]를 눌러 비교 상태로 들어간다(대표는 아직 안 고른다). */
export async function enterCompare(user: User): Promise<void> {
  const btns = within(groupCard(0)).getAllByRole('button', { name: '대표로 검토' })
  await user.click(btns[0])
}
/** 비교 상태에서 한 쪽을 대표로 고른다. */
export async function pickPrimary(user: User, side: string): Promise<void> {
  await user.click(within(compareCard(side)).getByRole('button', { name: '대표로 검토' }))
}
/** 목록 → 비교 → 대표(좌) → [병합 내용 검토]로 확인창을 연다. */
export async function openConfirm(user: User): Promise<void> {
  await enterCompare(user)
  await pickPrimary(user, '좌')
  await user.click(screen.getByRole('button', { name: '병합 내용 검토' }))
}
/** 확인창에서 읽음 체크 후 [병합 확정]을 누른다. */
export async function ackAndConfirm(user: User): Promise<void> {
  await user.click(screen.getByRole('checkbox', { name: /읽었습니다/ }))
  await user.click(screen.getByTestId('danger'))
}
