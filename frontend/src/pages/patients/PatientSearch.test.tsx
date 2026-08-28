import { act, render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse, delay } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { server } from '../../test/msw/server'
import { AuthProvider } from '../../auth/AuthProvider'
import { ConnectivityProvider } from '../../lib/connectivity'
import { PanelProvider } from '../../components/PanelHost'
import { PanelHost } from '../../components/PanelHost'
import { PatientSearch } from './PatientSearch'
import type { SearchPatientRow } from '../../api/patients'

// ── PatientSearch 통합 테스트 (SEARCH-*) ──────────────────────────────
// ⭐ 실제 24a 계약을 msw로 흉내낸다: 한 칸(q)+커서(cursor) → {rows(마스킹), next_cursor, has_more}.
//    24a는 전체 건수·appointment_id를 주지 않는다 — 그 경계는 아래 테스트가 「호출 지점만」 확인한다.
// 규칙 한 줄에 규칙 ID 하나. 0.4초 자동검색은 가짜 타이머로 검사한다(shouldAdvanceTime로 msw는 그대로 흐른다).

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => vi.useRealTimers())

function mkRow(over: Partial<SearchPatientRow> = {}): SearchPatientRow {
  return {
    patient_id: over.patient_id ?? `p-${over.name ?? '김'}`,
    name: '김*수',
    masked_phone: '010-****-5678',
    masked_birth_date: '1958-**-12',
    gender: 'M',
    matched: ['name'],
    today_status: null,
    today_appointment_time: null,
    ...over,
  }
}

interface Page {
  rows: SearchPatientRow[]
  next_cursor: string | null
  has_more: boolean
}

interface Config {
  mode?: 'page' | 'pick'
  onPick?: (id: string) => void
  /** q별 응답. 커서 없는 첫 페이지. 없으면 빈 결과. */
  first?: Page
  /** 커서로 이어받는 다음 페이지들. cursor 문자열 → Page. */
  more?: Record<string, Page>
  /** 이 q(정확히 일치)는 test가 풀어줄 때까지 응답을 미룬다(경합·진행표시용). */
  holdQuery?: string
  /** 이 q는 서버 오류(loadMore 실패 검사용은 more 경로에서). */
  errorOnCursor?: string
}

function emptyPage(): Page {
  return { rows: [], next_cursor: null, has_more: false }
}

function renderSearch(config: Config = {}) {
  const state = {
    first: config.first ?? emptyPage(),
    more: config.more ?? {},
    holdQuery: config.holdQuery,
    errorOnCursor: config.errorOnCursor,
    released: false,
  }

  server.use(
    http.get('*/patients', async ({ request }) => {
      const url = new URL(request.url)
      const q = url.searchParams.get('q') ?? ''
      const cursor = url.searchParams.get('cursor')
      if (cursor) {
        if (state.errorOnCursor === cursor) {
          return HttpResponse.json({ detail: '불러오지 못했습니다' }, { status: 500 })
        }
        return HttpResponse.json(state.more[cursor] ?? emptyPage())
      }
      if (state.holdQuery !== undefined && q === state.holdQuery && !state.released) {
        await delay('infinite')
      }
      return HttpResponse.json(state.first)
    }),
  )

  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const staffProfile = {
    staffId: 's-1',
    name: '김접수',
    email: 'recep@lunahospital.test',
    role: 'receptionist' as const,
    departmentId: null,
    departmentName: null,
  }

  const view = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter
        initialEntries={['/patients']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ConnectivityProvider>
          <AuthProvider initialAuth={{ session: { access_token: 't' }, staff: staffProfile }}>
            <PanelProvider>
              <Routes>
                <Route
                  path="/patients"
                  element={
                    <>
                      <PatientSearch mode={config.mode} onPick={config.onPick} />
                      <PanelHost />
                    </>
                  }
                />
                <Route path="/patients/:id" element={<Probe label="환자 상세" />} />
                <Route path="/queue" element={<Probe label="대기 목록" />} />
                <Route path="/calendar" element={<Probe label="캘린더" />} />
              </Routes>
            </PanelProvider>
          </AuthProvider>
        </ConnectivityProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { user, view, release: () => { state.released = true } }
}

function Probe({ label }: { label: string }) {
  const loc = useLocation()
  return <div data-probe={label} data-location={loc.pathname + loc.search}>{label}</div>
}

function routerPath(): string {
  return document.querySelector('[data-location]')?.getAttribute('data-location') ?? '/patients'
}
function searchBox(): HTMLElement {
  return screen.getByRole('textbox', { name: '환자 검색' })
}
function countBadge(): HTMLElement {
  return screen.getByTestId('search-count')
}
function resultList(): HTMLElement {
  return screen.getByTestId('search-results')
}
function rowByName(name: string): HTMLElement {
  const el = screen.getByText(name).closest('li')
  if (!el) throw new Error(`검색 결과 줄을 찾지 못함: ${name}`)
  return el as HTMLElement
}
async function search(user: ReturnType<typeof userEvent.setup>, q: string) {
  await user.click(searchBox())
  await user.paste(q)
  await user.keyboard('{Enter}')
}
function scrollToBottom(el: HTMLElement) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1000 })
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: 300 })
  Object.defineProperty(el, 'scrollTop', { configurable: true, writable: true, value: 700 })
  fireEvent.scroll(el)
}

// ── 검색 상자 · 사용법 안내 (BOX-01·02 · SB-17) ──────────────────────
describe('검색 상자·안내', () => {
  test('[SEARCH-BOX-01][SEARCH-BOX-02] 검색은 한 칸이고, 무엇을 넣어도 된다고 스스로 알린다', () => {
    renderSearch()
    expect(screen.getAllByRole('textbox')).toHaveLength(1) // 이름·전화·생일을 나누지 않는다
    expect(
      screen.getByPlaceholderText('이름 · 전화번호 · 생년월일 중 아는 것을 넣어 주세요'),
    ).toBeVisible()
  })

  test('[SEARCH-BOX-02 보조·SB-17] 검색 전에는 사용법만, 「최근 본 환자」는 두지 않는다', () => {
    renderSearch()
    expect(screen.getByText(/이름 일부만 넣어도/)).toBeVisible()
    expect(screen.queryByText('최근 본 환자')).toBeNull() // 어깨너머 노출 방지
  })
})

// ── 자동검색 · 경합 (RUN-01·02·03·04·05) ─────────────────────────────
describe('자동검색·경합', () => {
  test('[SEARCH-RUN-01] 손이 멈추면 0.4초 뒤 자동으로 찾는다 — Enter를 요구하지 않는다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderSearch({ first: { rows: [mkRow({ name: '자동김' })], next_cursor: null, has_more: false } })
    await user.click(searchBox())
    await user.paste('김')
    expect(screen.queryByText('자동김')).toBeNull() // 치는 중에는 안 나간다
    act(() => vi.advanceTimersByTime(400))
    await waitFor(() => expect(screen.getByText('자동김')).toBeVisible())
  })

  test('[SEARCH-RUN-02] Enter는 기다리지 않고 지금 당장 찾는다', async () => {
    const { user } = renderSearch({
      first: { rows: [mkRow({ name: '즉시김' })], next_cursor: null, has_more: false },
    })
    await user.click(searchBox())
    await user.paste('김')
    await user.keyboard('{Enter}') // 400ms를 기다리지 않는다
    await waitFor(() => expect(screen.getByText('즉시김')).toBeVisible())
  })

  test('[SEARCH-RUN-03] 여러 글자를 이어 쳐도 검색은 한 번이다(기록장이 세 줄이 되지 않는다)', async () => {
    let calls = 0
    server.use(
      http.get('*/patients', ({ request }) => {
        if (new URL(request.url).searchParams.get('cursor') == null) calls += 1
        return HttpResponse.json(emptyPage())
      }),
    )
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ConnectivityProvider>
            <AuthProvider initialAuth={{ session: { access_token: 't' }, staff: { staffId: 's', name: 'n', email: 'e', role: 'receptionist', departmentId: null, departmentName: null } }}>
              <PanelProvider>
                <PatientSearch />
              </PanelProvider>
            </AuthProvider>
          </ConnectivityProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await user.click(searchBox())
    await user.paste('김철수') // 세 글자를 한 번에
    act(() => vi.advanceTimersByTime(400))
    await waitFor(() => expect(calls).toBe(1)) // 글자마다가 아니라 손이 멈춘 뒤 한 번
  })

  test('[SEARCH-RUN-04] 새로 찾는 동안 이미 뜬 목록을 지우지 않고, 진행 표시는 건수 옆에만', async () => {
    const { user, release } = renderSearch({
      first: { rows: [mkRow({ name: '먼저김' })], next_cursor: null, has_more: false },
    })
    await search(user, '김')
    await waitFor(() => expect(screen.getByText('먼저김')).toBeVisible())

    // 두 번째 검색을 서버가 붙잡는다 — 그 사이 이전 목록은 그대로.
    renderHold()
    await user.click(searchBox())
    await user.paste(' 1234')
    await user.keyboard('{Enter}')
    expect(screen.getByText('먼저김')).toBeVisible() // 하얗게 깜빡이지 않는다
    expect(within(countBadge()).getByLabelText('찾는 중')).toBeVisible() // 진행 표시는 건수 옆
    release()

    function renderHold() {
      server.use(
        http.get('*/patients', async ({ request }) => {
          const q = new URL(request.url).searchParams.get('q') ?? ''
          if (q.includes('1234')) await delay('infinite')
          return HttpResponse.json({ rows: [mkRow({ name: '먼저김' })], next_cursor: null, has_more: false })
        }),
      )
    }
  })

  test('[SEARCH-RUN-05] 늦게 도착한 지난 검색 결과는 버린다', async () => {
    server.use(
      http.get('*/patients', async ({ request }) => {
        const q = new URL(request.url).searchParams.get('q') ?? ''
        if (q === '김') {
          await delay(80) // 넓은 검색이 느리다
          return HttpResponse.json({ rows: [mkRow({ name: '브로드결과' })], next_cursor: null, has_more: false })
        }
        return HttpResponse.json({ rows: [mkRow({ name: '좁힘결과' })], next_cursor: null, has_more: false })
      }),
    )
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ConnectivityProvider>
            <AuthProvider initialAuth={{ session: { access_token: 't' }, staff: { staffId: 's', name: 'n', email: 'e', role: 'receptionist', departmentId: null, departmentName: null } }}>
              <PanelProvider>
                <PatientSearch />
              </PanelProvider>
            </AuthProvider>
          </ConnectivityProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await user.click(searchBox())
    await user.paste('김')
    await user.keyboard('{Enter}') // 느린 김
    await user.paste(' 1234')
    await user.keyboard('{Enter}') // 좁힘(빠름)
    await waitFor(() => expect(screen.getByText('좁힘결과')).toBeVisible())
    act(() => vi.advanceTimersByTime(120)) // 느린 김이 이제 도착
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText('브로드결과')).toBeNull() // 좁힌 화면을 덮지 않는다
    expect(screen.getByText('좁힘결과')).toBeVisible()
  })
})

// ── 건수 · 이어받기 · 이유 · 0건 (RESULT-01·03~10 · WHY · AND-02) ──────
describe('결과·이유·이어받기', () => {
  test('[SEARCH-RESULT-01] 칸 바로 아래에 찾은 수를 적는다', async () => {
    const { user } = renderSearch({
      first: { rows: [mkRow({ name: 'A' }), mkRow({ name: 'B' })], next_cursor: null, has_more: false },
    })
    await search(user, '김')
    await waitFor(() => expect(within(countBadge()).getByText(/2명/)).toBeVisible())
  })

  test('[SEARCH-AND-02] 뒤에 조각을 이어 치면 그게 재검색이다 — 두 번째 칸이 없다', async () => {
    let lastQ = ''
    const { user } = renderSearch()
    // renderSearch의 기본 핸들러 뒤에 등록해야 우선한다(msw 런타임 핸들러는 최근 것이 먼저 매칭).
    server.use(
      http.get('*/patients', ({ request }) => {
        lastQ = new URL(request.url).searchParams.get('q') ?? ''
        return HttpResponse.json({ rows: [mkRow({ name: '좁힘' })], next_cursor: null, has_more: false })
      }),
    )
    await search(user, '김')
    await user.click(searchBox())
    await user.paste(' 1234')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(lastQ).toBe('김 1234'))
    expect(screen.getAllByRole('textbox')).toHaveLength(1) // 여전히 한 칸
  })

  test('[SEARCH-RESULT-03][SEARCH-RESULT-04] 아래로 내리면 다음 20건이 자동으로 이어 붙는다', async () => {
    const { user } = renderSearch({
      first: { rows: [mkRow({ patient_id: 'p1', name: '첫장' })], next_cursor: 'c1', has_more: true },
      more: { c1: { rows: [mkRow({ patient_id: 'p2', name: '둘째장' })], next_cursor: null, has_more: false } },
    })
    await search(user, '김')
    await waitFor(() => expect(screen.getByText('첫장')).toBeVisible())
    expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull() // [더 보기] 없음
    scrollToBottom(resultList())
    await waitFor(() => expect(screen.getByText('둘째장')).toBeVisible())
  })

  test('[SEARCH-RESULT-05] 마지막까지 받으면 끝을 알린다', async () => {
    const { user } = renderSearch({
      first: { rows: [mkRow({ name: '유일' })], next_cursor: null, has_more: false },
    })
    await search(user, '김')
    await waitFor(() => expect(screen.getByText('유일')).toBeVisible())
    expect(screen.getByText('처음부터 모두 보여드렸습니다')).toBeVisible() // "더 있는데 안 나오나" 방지
  })

  test('[SEARCH-RESULT-06] 이어받기가 실패하면 [다시 시도] 한 줄, 받은 줄은 유지', async () => {
    const { user } = renderSearch({
      first: { rows: [mkRow({ name: '받은줄' })], next_cursor: 'bad', has_more: true },
      errorOnCursor: 'bad',
    })
    await search(user, '김')
    await waitFor(() => expect(screen.getByText('받은줄')).toBeVisible())
    scrollToBottom(resultList())
    await waitFor(() => expect(screen.getByRole('button', { name: '다시 시도' })).toBeVisible())
    expect(screen.getByText('받은줄')).toBeVisible() // 받은 줄은 그대로
  })

  test('[SEARCH-RESULT-07][SEARCH-RESULT-08] 목록을 막지도, 「전부 보이기」로 자르지도 않는다', async () => {
    const { user } = renderSearch({
      first: { rows: [mkRow({ name: '많음' })], next_cursor: 'c1', has_more: true },
    })
    await search(user, '김')
    await waitFor(() => expect(screen.getByText('많음')).toBeVisible())
    expect(screen.queryByText(/너무 많으니 더 좁혀/)).toBeNull()
    expect(screen.queryByRole('button', { name: /전부 보이기|모두 펼치기/ })).toBeNull()
  })

  test('[SEARCH-RESULT-09] 줄에 마스킹된 이름·생년월일·전화가 오고 원본은 오지 않는다', async () => {
    const { user } = renderSearch({
      first: {
        rows: [mkRow({ name: '김순자', masked_birth_date: '1958-**-12', masked_phone: '010-****-5678' })],
        next_cursor: null,
        has_more: false,
      },
    })
    await search(user, '김순자')
    const row = await waitFor(() => rowByName('김순자'))
    expect(within(row).getByText('1958-**-12')).toBeVisible()
    expect(within(row).getByText('010-****-5678')).toBeVisible()
    expect(within(row).queryByText('01012345678')).toBeNull() // 원본은 오지도 않는다
  })

  test('[SEARCH-WHY-01][SEARCH-WHY-03] 왜 걸렸는지 배지로 — 여러 조각이면 배지도 여럿', async () => {
    const { user } = renderSearch({
      first: { rows: [mkRow({ name: '김철수', matched: ['name', 'phone'] })], next_cursor: null, has_more: false },
    })
    await search(user, '김 1234')
    const row = await waitFor(() => rowByName('김철수'))
    expect(within(row).getByText('이름 일치')).toBeVisible()
    expect(within(row).getByText('전화 일치')).toBeVisible()
  })

  test('[SEARCH-WHY-02] 맞은 글자를 굵게 칠하지 않는다 — 가려진 자리가 드러나지 않게', async () => {
    const { user } = renderSearch({
      first: { rows: [mkRow({ name: '김철수', masked_phone: '010-****-5678', matched: ['phone'] })], next_cursor: null, has_more: false },
    })
    await search(user, '1234')
    const row = await waitFor(() => rowByName('김철수'))
    expect(within(row).queryByRole('mark')).toBeNull() // 강조 <mark> 없음
    expect(row.querySelector('mark')).toBeNull()
    expect(within(row).getByText('전화 일치')).toBeVisible() // 배지로만
  })

  test('[SEARCH-RESULT-10] 0건이면 「없습니다」 + 다음에 할 일, [다시 시도]는 없다', async () => {
    const { user } = renderSearch({ first: emptyPage() })
    await search(user, '없는사람 9999')
    await waitFor(() => expect(screen.getByText('조회된 환자가 없습니다')).toBeVisible())
    expect(screen.getByRole('button', { name: '마지막 조각 지우기' })).toBeVisible()
    expect(screen.getByRole('button', { name: '검색어 모두 지우기' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull() // 0건은 오류가 아니다
  })
})

// ── 줄에서 바로 하는 일 (ACT-01~06 · 09) ─────────────────────────────
describe('상태별 동작', () => {
  test('[SEARCH-ACT-01] 줄의 동작은 오늘 상태의 것만 뜬다 — 네 상태를 한 줄에 늘어놓지 않는다', async () => {
    const { user } = renderSearch({
      first: { rows: [mkRow({ name: '미도착', today_status: 'booked' })], next_cursor: null, has_more: false },
    })
    await search(user, '김')
    const row = await waitFor(() => rowByName('미도착'))
    // booked면 진료 대기/도착만 — 다른 상태의 동작은 없다
    expect(within(row).queryByRole('button', { name: '예약 잡기' })).toBeNull()
    expect(within(row).queryByRole('button', { name: '당일 방문 등록' })).toBeNull()
    expect(within(row).queryByRole('button', { name: '대기 목록에서 보기' })).toBeNull()
  })

  test('[SEARCH-ACT-02] 오늘 예약·미도착 → [진료 대기]·[도착] 두 갈래(하이브리드)', async () => {
    const { user } = renderSearch({
      first: { rows: [mkRow({ name: '미도착', today_status: 'booked', today_appointment_time: '14:30' })], next_cursor: null, has_more: false },
    })
    await search(user, '김')
    const row = await waitFor(() => rowByName('미도착'))
    expect(within(row).getByRole('button', { name: '진료 대기' })).toBeVisible()
    expect(within(row).getByRole('button', { name: '도착' })).toBeVisible()
    expect(within(row).getByText('오늘 예약 14:30')).toBeVisible() // ORDER-06 — 위에 있는 이유
  })

  test('[SEARCH-ACT-03] 오늘 이미 대기·진료 중 → [대기 목록에서 보기]로 이동', async () => {
    const { user } = renderSearch({
      first: { rows: [mkRow({ name: '대기중', today_status: 'arrived' })], next_cursor: null, has_more: false },
    })
    await search(user, '김')
    const row = await waitFor(() => rowByName('대기중'))
    await user.click(within(row).getByRole('button', { name: '대기 목록에서 보기' }))
    await waitFor(() => expect(routerPath().startsWith('/queue')).toBe(true))
  })

  test('[SEARCH-ACT-04] 오늘 진료 완료 → 동작 없음, [환자 상세]만', async () => {
    const { user } = renderSearch({
      first: { rows: [mkRow({ name: '완료', today_status: 'done' })], next_cursor: null, has_more: false },
    })
    await search(user, '김')
    const row = await waitFor(() => rowByName('완료'))
    expect(within(row).queryByRole('button', { name: /도착|예약 잡기|당일 방문|진료 대기/ })).toBeNull()
    expect(within(row).getByRole('link', { name: '환자 상세' })).toBeVisible()
  })

  test('[SEARCH-ACT-05] 오늘 아무것도 없음 → [예약 잡기]·[당일 방문 등록] 둘', async () => {
    const { user } = renderSearch({
      first: { rows: [mkRow({ name: '없음', today_status: null })], next_cursor: null, has_more: false },
    })
    await search(user, '김')
    const row = await waitFor(() => rowByName('없음'))
    expect(within(row).getByRole('button', { name: '예약 잡기' })).toBeVisible()
    expect(within(row).getByRole('button', { name: '당일 방문 등록' })).toBeVisible()
  })

  test('[SEARCH-ACT-06] [당일 방문 등록]은 그 자리에서 패널, [예약 잡기]는 캘린더로', async () => {
    const { user } = renderSearch({
      first: { rows: [mkRow({ patient_id: 'p1', name: '김민정', today_status: null })], next_cursor: null, has_more: false },
    })
    await search(user, '김민정')
    const row = await waitFor(() => rowByName('김민정'))
    await user.click(within(row).getByRole('button', { name: '당일 방문 등록' }))
    expect(screen.getByRole('complementary', { name: '패널' })).toBeVisible() // 그 자리에서 패널
    expect(routerPath()).toBe('/patients') // 워크인은 자리를 안 옮긴다

    await user.click(within(rowByName('김민정')).getByRole('button', { name: '예약 잡기' }))
    await waitFor(() => expect(routerPath()).toBe('/calendar')) // 예약은 캘린더로 옮겨 간다
  })

  test('[SEARCH-ACT-09] [도착]에 확인창을 두지 않고, 되돌릴 수 있게 한다', async () => {
    const { user } = renderSearch({
      first: { rows: [mkRow({ name: '미도착', today_status: 'booked' })], next_cursor: null, has_more: false },
    })
    await search(user, '김')
    const row = await waitFor(() => rowByName('미도착'))
    await user.click(within(row).getByRole('button', { name: '도착' }))
    expect(screen.queryByRole('dialog')).toBeNull() // 매번 손 멈추는 확인창 없음
    await waitFor(() =>
      expect(within(rowByName('미도착')).getByRole('button', { name: /되돌리기/ })).toBeVisible(),
    )
  })
})

// ── 공유 부품: page/pick 모드 (ACT-08 · ONE-01 · PICK-BTN-04) ─────────
describe('공유 부품 mode', () => {
  test('[PICK-BTN-04] page 모드 목록에 [선택](여러 명 고르기)이 붙는다', async () => {
    const { user } = renderSearch({
      first: { rows: [mkRow({ name: '홍길동' })], next_cursor: null, has_more: false },
    })
    await search(user, '김')
    await waitFor(() => expect(screen.getByText('홍길동')).toBeVisible())
    expect(screen.getByRole('button', { name: '선택' })).toBeVisible()
  })

  test('[SEARCH-ACT-08] pick 모드는 줄 전체가 고르기 — 동작 버튼·[선택]이 없다', async () => {
    const onPick = vi.fn()
    const { user } = renderSearch({
      mode: 'pick',
      onPick,
      first: { rows: [mkRow({ patient_id: 'p9', name: '고를사람', today_status: 'booked' })], next_cursor: null, has_more: false },
    })
    await search(user, '김')
    const row = await waitFor(() => rowByName('고를사람'))
    expect(within(row).queryByRole('button', { name: '도착' })).toBeNull() // 동작 버튼 없음
    expect(screen.queryByRole('button', { name: '선택' })).toBeNull() // 여러 명 [선택]도 없음
    await user.click(within(row).getByRole('button', { name: /고를사람/ }))
    // ⭐ 줄 전체를 함께 준다 — 고른 쪽이 이름·가린 값을 다시 조회하지 않게(D3 워크인 패널).
    expect(onPick).toHaveBeenCalledWith('p9', expect.objectContaining({ patient_id: 'p9', name: '고를사람' }))
  })

  test('[SEARCH-ONE-01] pick 모드에서 1명만 나와도 자동으로 골라두지 않는다', async () => {
    const onPick = vi.fn()
    const { user } = renderSearch({
      mode: 'pick',
      onPick,
      first: { rows: [mkRow({ patient_id: 'p1', name: '김순자' })], next_cursor: null, has_more: false },
    })
    await search(user, '김순자')
    await waitFor(() => expect(screen.getByText('김순자')).toBeVisible())
    expect(onPick).not.toHaveBeenCalled() // 직원이 눌러야 골라진다
  })
})
