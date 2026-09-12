import { render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { server } from '../../test/msw/server'
import { PanelHost, PanelProvider } from '../../components/PanelHost'
import { PatientDetailPage } from './PatientDetailPage'
import type { Role } from '../../auth/roles'

// 역할은 useAuth를 통해 온다 — 셸/셸테스트와 같은 방식으로 대체한다(AppShell.test 참고).
let currentRole: Role = 'receptionist'
vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ staff: { staffId: 's1', name: '김수진', email: 'x@y.z', role: currentRole, departmentId: null, departmentName: null } }),
}))

const DETAIL = { id: 'p1', name: '홍길동', birth_date: '1958-03-12', gender: '남', phone: '010-0000-5678' }

interface MockOpts {
  detail?: Record<string, unknown> | number // number = 상태코드로 실패
  visits?: unknown[]
  records?: unknown[]
  family?: unknown[]
  notes?: unknown[]
  failSection?: 'visits' | 'records' | 'family' | 'notes'
}

function mockAll(opts: MockOpts = {}) {
  const page = (rows: unknown[] = []) => ({ rows, next_cursor: null, has_more: false })
  server.use(
    http.get('*/patients/:id/visits', () =>
      opts.failSection === 'visits' ? new HttpResponse(null, { status: 500 }) : HttpResponse.json(page(opts.visits)),
    ),
    http.get('*/patients/:id/medical-records', () =>
      opts.failSection === 'records' ? new HttpResponse(null, { status: 500 }) : HttpResponse.json(page(opts.records)),
    ),
    http.get('*/patients/:id/family', () =>
      opts.failSection === 'family' ? new HttpResponse(null, { status: 500 }) : HttpResponse.json(opts.family ?? []),
    ),
    http.get('*/patients/:id/notes', () =>
      opts.failSection === 'notes' ? new HttpResponse(null, { status: 500 }) : HttpResponse.json(opts.notes ?? []),
    ),
    http.get('*/patients/:id', () =>
      typeof opts.detail === 'number'
        ? new HttpResponse(null, { status: opts.detail })
        : HttpResponse.json(opts.detail ?? DETAIL),
    ),
  )
}

function renderDetail() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <PanelProvider>
        <MemoryRouter initialEntries={['/patients/p1']}>
          <Routes>
            <Route path="/patients/:id" element={<PatientDetailPage />} />
            <Route path="*" element={<div data-testid="elsewhere" />} />
          </Routes>
        </MemoryRouter>
        <PanelHost />
      </PanelProvider>
    </QueryClientProvider>,
  )
}

const section = (name: string) => screen.getByRole('region', { name })

describe('PatientDetailPage', () => {
  beforeEach(() => {
    currentRole = 'receptionist'
  })
  afterEach(() => vi.clearAllMocks())

  test('[PTDET-HEAD-01][MASK-DETAIL-01] 상세는 전화번호·생년월일을 전체 노출한다', async () => {
    mockAll()
    renderDetail()
    expect(await screen.findByText('홍길동')).toBeVisible()
    expect(screen.getByText('010-0000-5678')).toBeVisible()
    expect(screen.getByText('1958-03-12')).toBeVisible()
    expect(screen.getByTestId('phone').textContent).not.toContain('*')
  })

  test('[PTDET-HEAD-06][MASK-TEL-02] tel: 링크를 만들지 않고 복사를 준다', async () => {
    mockAll()
    renderDetail()
    const phone = await screen.findByTestId('phone')
    expect(phone.closest('a')).toBeNull()
    expect(screen.getByRole('button', { name: '복사' })).toBeVisible()
  })

  test('[PTDET-VISIT-04][DISP-COLOR-01] 진행 중 예약을 방문 이력에 「현재」 배지와 문장으로 보인다', async () => {
    // [PTDET-STATUS 은퇴] 예전의 상태 카드(status-card)는 이력 첫 줄과 중복이라 뺐다(손검수 ⑥) —
    //   「진행 중을 보인다」는 이제 방문 이력의 「현재」 배지가 맡는다.
    mockAll({ visits: [{ id: 'v1', patient_id: 'p1', occurred_at: '2026-08-17T14:30:00+09:00', status: '진료중', department_name: '내과', doctor_name: '박지훈' }] })
    renderDetail()
    const visit = within(section('예약·방문 이력'))
    expect(await visit.findByText('8/17 14:30')).toBeVisible()
    expect(visit.getByText('진료중')).toBeVisible()
    expect(visit.getByText('현재')).toBeVisible()
    expect(visit.getByText(/내과/)).toBeVisible()
  })

  test('[PTDET-VISIT-05] 취소·부도도 숨기지 않고 중립 문구로 적는다', async () => {
    mockAll({ visits: [{ id: 'v1', patient_id: 'p1', occurred_at: '2026-08-05T14:30:00+09:00', status: '예약부도' }] })
    renderDetail()
    const visit = await screen.findByText('예약 부도')
    expect(visit).toBeVisible()
    expect(section('예약·방문 이력')).not.toHaveTextContent(/무단|불참|안 오셨/)
  })

  test('[PTDET-VISIT-06][EMPTY-ZERO-01] 이력 0건에 새 예약 버튼을 여기에 또 만들지 않는다', async () => {
    mockAll({ visits: [] })
    renderDetail()
    expect(await screen.findByText('예약·방문 이력이 없습니다')).toBeVisible()
    expect(within(section('예약·방문 이력')).queryByRole('button', { name: /새 예약/ })).toBeNull()
  })

  test('[PTDET-FAMILY-01][PTDET-FAMILY-02] 활성 연결만 이름·관계로, 생년월일·전화는 없다', async () => {
    mockAll({ family: [{ id: 'l1', patient_id: 'fp1', name: '김*수', relation: '자녀' }] })
    renderDetail()
    await screen.findByText('홍길동')
    const fam = within(section('가족 관계'))
    expect(fam.getByText('김*수')).toBeVisible()
    expect(fam.getByText('자녀')).toBeVisible()
    expect(section('가족 관계')).not.toHaveTextContent(/010-/)
    expect(section('가족 관계')).not.toHaveTextContent(/\d{4}-\d{2}-\d{2}/)
  })

  test('[PTDET-RECORD-05][EMPTY-ZERO-01] 기록 0건에 삭제·숨김을 암시하지 않는다', async () => {
    mockAll({ records: [] })
    renderDetail()
    expect(await screen.findByText('완료된 진료기록이 없습니다')).toBeVisible()
    expect(section('진료기록')).not.toHaveTextContent(/삭제|숨김|볼 수 없/)
  })

  test('[PTDET-LOAD-02] 한 섹션이 실패해도 나머지를 지우지 않는다', async () => {
    mockAll({ failSection: 'records', visits: [{ id: 'v1', patient_id: 'p1', occurred_at: '2026-08-05T14:30:00+09:00', status: '진료완료' }] })
    renderDetail()
    // 성공 섹션은 남는다
    expect(await within(section('예약·방문 이력')).findByText('8/5 14:30')).toBeVisible()
    // 실패 섹션에만 [다시 시도]
    await waitFor(() => expect(within(section('진료기록')).getByText('정보를 불러오지 못했습니다')).toBeVisible())
    expect(within(section('진료기록')).getByRole('button', { name: '다시 시도' })).toBeVisible()
    expect(within(section('예약·방문 이력')).queryByRole('button', { name: '다시 시도' })).toBeNull()
  })

  test('[PTDET-ACTION-04][PTDET-ACTION-05] 병합·본문 새 예약 버튼을 만들지 않는다', async () => {
    mockAll()
    renderDetail()
    await screen.findByText('홍길동')
    expect(screen.queryByRole('button', { name: /병합|합치기/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /새 예약|당일 방문/ })).toBeNull()
    expect(screen.getByRole('button', { name: '가족 연결 추가' })).toBeVisible()
  })

  test('[PTDET-QNR-03][A안] 관리자는 답변 내용은 못 보고 작성 여부만 본다 — 내용 요청은 하지 않는다', async () => {
    currentRole = 'admin'
    let questionnaireHit = false
    mockAll({
      visits: [
        { id: 'a1', status: '진료완료', occurred_at: '2026-08-05T09:00:00+09:00', questionnaire_submitted_at: '2026-08-04T21:10:00+09:00' },
        { id: 'a2', status: '예약확정', occurred_at: '2026-09-01T09:00:00+09:00', questionnaire_submitted_at: null },
      ],
    })
    // 답변 '내용' 엔드포인트는 직원에겐 아예 호출되지 않아야 한다(화면 분기가 아니라 요청 자체가 없음).
    server.use(http.get('*/appointments/:id/questionnaire', () => {
      questionnaireHit = true
      return HttpResponse.json({ questionnaire: null })
    }))
    renderDetail()
    const qnr = await screen.findByRole('region', { name: '사전문진' })
    expect(within(qnr).getByText('답변 내용은 담당 의사만 열람합니다')).toBeVisible()
    // 배지는 방문 이력이 로드된 뒤 나타난다.
    expect(await within(qnr).findByText('작성완료')).toBeVisible()
    expect(within(qnr).getByText('미작성')).toBeVisible()
    // 미작성 환자에게 문진표 요청을 보낼 경로가 있고, 죽은 「담당 의사에게 문의」 버튼은 없다.
    expect(within(qnr).getByRole('button', { name: '문진표 요청' })).toBeVisible()
    expect(within(qnr).queryByRole('button', { name: /담당 의사에게/ })).toBeNull()
    expect(questionnaireHit).toBe(false)
  })

  test('[PTDET-ACTION-06] 상세가 403이면 권한 안내 + 역할 기본 화면 경로를 준다', async () => {
    mockAll({ detail: 403 })
    renderDetail()
    expect(await screen.findByText('이 화면을 볼 권한이 없습니다')).toBeVisible()
    expect(screen.getByRole('button', { name: /화면으로|로그인/ })).toBeVisible()
  })
})
