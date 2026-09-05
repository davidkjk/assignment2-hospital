import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse, delay } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { server } from '../../../test/msw/server'
import { AuthProvider } from '../../../auth/AuthProvider'
import { ConnectivityProvider } from '../../../lib/connectivity'
import { QuestionnaireAdminPage } from './QuestionnaireAdminPage'
import type {
  DepartmentForm,
  DepartmentSummary,
  Question,
  SavedVersion,
  VersionSummary,
} from '../../../api/questionnaireAdmin'
import type { Role } from '../../../auth/roles'

// ── 공용 테스트 도구 (QADM-* 문진표 관리) ─────────────────────────────
// merge 화면과 같은 통합 방식 — 목록·편집기·버전 기록·확인창이 한 상태기계라
// 페이지를 통째로 렌더하고 msw로 계약을 흉내 낸다.

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = vi.fn()

export function mkQuestion(over: Partial<Question> & Pick<Question, 'id'>): Question {
  return { text: '질문', type: 'short_text', required: false, show_to: 'all', ...over }
}

// 목업 81의 내과 6문항.
export function naegwaQuestions(): Question[] {
  return [
    mkQuestion({ id: 'Q-SYMPTOM-01', text: '오늘 가장 불편한 증상을 알려주세요.', type: 'long_text', required: true }),
    mkQuestion({ id: 'Q-ONSET-02', text: '증상이 시작된 시점은 언제인가요?', type: 'short_text' }),
    mkQuestion({ id: 'Q-MEDICATION-03', text: '현재 복용 중인 약이 있으신가요?', type: 'yes_no', required: true }),
    mkQuestion({ id: 'Q-ALLERGY-04', text: '알레르기가 있으신가요?', type: 'yes_no', required: true }),
    mkQuestion({ id: 'Q-PREGNANCY-05', text: '임신 가능성이 있거나 임신 중이신가요?', type: 'yes_no', required: true, show_to: 'female' }),
    mkQuestion({ id: 'Q-NOTE-06', text: '의사에게 미리 전하고 싶은 내용이 있나요?', type: 'long_text' }),
  ]
}

function versionRow(over: Partial<VersionSummary> & Pick<VersionSummary, 'id' | 'version_no'>): VersionSummary {
  return {
    is_active: false,
    created_at: '2026-07-12T16:20:00',
    created_by_name: '박관리자',
    question_count: 6,
    ...over,
  }
}

// 서버가 주는 진료과 목록. ⚠️ 일부러 가나다순이 아니다(내과 < 산부인과 < 정형외과) —
// 화면이 다시 정렬하지 않는다는 것을 이 순서로 검증한다(QADM-DEPT-01).
export function defaultDepartments(): DepartmentSummary[] {
  return [
    { id: 'dept-1', name: '내과', active_version: 3, question_count: 6 },
    { id: 'dept-2', name: '정형외과', active_version: 2, question_count: 5 },
    { id: 'dept-3', name: '산부인과', active_version: null, question_count: 0 },
  ]
}

export function naegwaForm(questions: Question[] = naegwaQuestions()): DepartmentForm {
  return {
    department_id: 'dept-1',
    department_name: '내과',
    active_version: { id: 'v3-id', version_no: 3, questions },
    versions: [
      versionRow({ id: 'v3-id', version_no: 3, is_active: true, created_at: '2026-08-08T09:40:00', created_by_name: '김관리자', question_count: 6 }),
      versionRow({ id: 'v2-id', version_no: 2, created_at: '2026-07-12T16:20:00', created_by_name: '박관리자', question_count: 6 }),
      versionRow({ id: 'v1-id', version_no: 1, created_at: '2026-06-21T11:05:00', created_by_name: '김관리자', question_count: 4 }),
    ],
  }
}

export function emptyForm(): DepartmentForm {
  return { department_id: 'dept-3', department_name: '산부인과', active_version: null, versions: [] }
}

export interface RecordedCall {
  method: string
  path: string
  body: unknown
}

export interface SetupConfig {
  role?: Role
  online?: boolean
  departments?: DepartmentSummary[]
  /** deptId → 폼(GET /{id}) 응답. */
  forms?: Record<string, DepartmentForm>
  /** versionId → 버전 상세(GET /versions/{id}). */
  versions?: Record<string, SavedVersion>
  initialEntry?: string
}

function pathname(request: Request): string {
  return new URL(request.url).pathname
}

export function renderQnaAdmin(config: SetupConfig = {}) {
  const departments = config.departments ?? defaultDepartments()
  const forms = config.forms ?? { 'dept-1': naegwaForm(), 'dept-3': emptyForm() }
  const versionDetails = config.versions ?? {}

  const state = {
    calls: [] as RecordedCall[],
    overrides: new Map<string, { status: number; detail?: string }>(),
    pausedForm: false,
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
  async function bodyOf(request: Request): Promise<unknown> {
    try {
      return await request.clone().json()
    } catch {
      return null
    }
  }

  server.use(
    http.get('*/admin/questionnaires', ({ request }) => {
      const p = pathname(request)
      record('GET', p, null)
      const ov = overrideFor('GET', p)
      if (ov) return HttpResponse.json({ detail: ov.detail ?? '불러오지 못했습니다' }, { status: ov.status })
      return HttpResponse.json(departments)
    }),
    http.get('*/admin/questionnaires/versions/:versionId', ({ request, params }) => {
      const p = pathname(request)
      record('GET', p, null)
      const detail = versionDetails[params.versionId as string]
      if (!detail) return HttpResponse.json({ detail: '버전을 찾지 못했습니다' }, { status: 404 })
      return HttpResponse.json(detail)
    }),
    http.get('*/admin/questionnaires/:departmentId', async ({ request, params }) => {
      const p = pathname(request)
      record('GET', p, null)
      if (state.pausedForm) await delay('infinite')
      const ov = overrideFor('GET', p)
      if (ov) return HttpResponse.json({ detail: ov.detail ?? '불러오지 못했습니다' }, { status: ov.status })
      const form = forms[params.departmentId as string]
      if (!form) return HttpResponse.json({ detail: '진료과를 찾지 못했습니다' }, { status: 404 })
      return HttpResponse.json(form)
    }),
    http.post('*/admin/questionnaires/:departmentId/versions', async ({ request, params }) => {
      const p = pathname(request)
      const body = await bodyOf(request)
      record('POST', p, body)
      const ov = overrideFor('POST', p)
      if (ov) return HttpResponse.json({ detail: ov.detail ?? '저장하지 못했습니다' }, { status: ov.status })
      const posted = (body as { questions?: Question[] })?.questions ?? []
      const saved: SavedVersion = {
        id: 'v4-id',
        department_id: params.departmentId as string,
        version_no: 4,
        is_active: true,
        created_at: '2026-08-27T10:00:00',
        created_by_name: '김관리자',
        questions: posted,
      }
      return HttpResponse.json(saved, { status: 201 })
    }),
  )

  const api = {
    calls(match: string | RegExp): RecordedCall[] {
      return state.calls.filter((c) => {
        const label = `${c.method} ${c.path}`
        return typeof match === 'string' ? label.includes(match) : match.test(label)
      })
    },
    postCalls(): RecordedCall[] {
      return state.calls.filter((c) => c.method === 'POST')
    },
    respond(key: string, status: number, detail?: string) {
      state.overrides.set(key, { status, detail })
    },
    pauseForm() {
      state.pausedForm = true
    },
  }

  const user = userEvent.setup()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const role = config.role ?? 'admin'
  const staffProfile = {
    staffId: 's-001',
    name: '김관리자',
    email: 'admin@lunahospital.test',
    role,
    departmentId: null,
    departmentName: null,
  }

  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter
        initialEntries={[config.initialEntry ?? '/admin/questionnaires']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ConnectivityProvider>
          <AuthProvider initialAuth={{ session: { access_token: 't' }, staff: staffProfile }}>
            <Routes>
              <Route path="/admin/questionnaires" element={<QuestionnaireAdminPage />} />
              <Route path="/doctor/console" element={<Probe label="진료 화면" />} />
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
  return <div data-location={`${loc.pathname}${loc.search}`}>{label}</div>
}

export function routerLocation(): string {
  return document.querySelector('[data-location]')?.getAttribute('data-location') ?? ''
}

/** 브라우저 오프라인 전환을 흉내 낸다(연결 판정은 useConnectivity가 이벤트로 듣는다). */
export function goOffline() {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false })
  window.dispatchEvent(new Event('offline'))
}
