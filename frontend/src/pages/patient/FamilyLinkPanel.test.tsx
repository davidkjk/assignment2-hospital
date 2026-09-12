import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { server } from '../../test/msw/server'
import { FamilyLinkPanel } from './FamilyLinkPanel'

// [PTDET-FAMILY-03~06] 실 흐름 동작 검증(시각 충실도는 브라우저 대조로 별도).
//   검색 → 동명이인 재확인 → 관계 → 서버 판정 → OTP/예외 갈래 → 연결. 우회 차단(FAMILY-04)까지.

// InlineError가 useEffect에서 scrollIntoView를 부른다 — jsdom엔 레이아웃이 없어 스텁한다.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = vi.fn()

const B_ROW = {
  patient_id: 'b1',
  name: '김영희',
  masked_phone: '010-****-8888',
  masked_birth_date: '1990-**-**',
  gender: 'F',
  matched: [],
  today_status: 'none',
  today_appointment_time: null,
  today_department_name: null,
  today_doctor_name: null,
}

function mockSearch() {
  server.use(
    http.get('*/patients', () =>
      HttpResponse.json({ rows: [B_ROW], next_cursor: null, has_more: false }),
    ),
  )
}

async function pickBAndRelation() {
  const user = userEvent.setup()
  // 검색 → Enter로 즉시 검색(디바운스 우회)
  const box = screen.getByPlaceholderText('이름·전화·생년월일로 검색')
  await user.type(box, '김영희')
  fireEvent.keyDown(box, { key: 'Enter' })
  const pick = await screen.findByRole('button', { name: /김영희/ })
  await user.click(pick)
  // [SEARCH-SAME-01] 동명이인 재확인 창 — 확인해야 넘어간다
  const confirm = await screen.findByRole('button', { name: '이 사람 선택' })
  await user.click(confirm)
  // 관계 입력
  const rel = await screen.findByPlaceholderText(/배우자/)
  await user.type(rel, '배우자')
  await user.click(screen.getByRole('button', { name: '본인 확인으로 이동' }))
  return user
}

describe('FamilyLinkPanel', () => {
  beforeEach(() => mockSearch())
  afterEach(() => vi.restoreAllMocks())

  test('번호 있는 B → OTP 갈래로 가고 인증번호 발송을 부른다', async () => {
    const requestSpy = vi.fn()
    server.use(
      http.post('*/patients/:id/family/:mid/verify-eligibility', () =>
        HttpResponse.json({ allowed: false, message: '' }),
      ),
      http.post('*/patients/:id/family/otp/request', async ({ request }) => {
        requestSpy(await request.json())
        return HttpResponse.json({ ok: true })
      }),
    )
    render(<FamilyLinkPanel accountPatientId="a1" onDone={() => {}} />)
    await pickBAndRelation()

    // OTP 화면으로 분기 + 발송 호출
    expect(await screen.findByText(/인증번호를 보냈습니다/)).toBeInTheDocument()
    await waitFor(() => expect(requestSpy).toHaveBeenCalledTimes(1))
    expect(requestSpy).toHaveBeenCalledWith({ family_patient_id: 'b1', relation: '배우자' })
  })

  test('OTP 확인 성공 시 onDone을 부른다', async () => {
    const onDone = vi.fn()
    server.use(
      http.post('*/patients/:id/family/:mid/verify-eligibility', () =>
        HttpResponse.json({ allowed: false, message: '' }),
      ),
      http.post('*/patients/:id/family/otp/request', () => HttpResponse.json({ ok: true })),
      http.post('*/patients/:id/family/otp/confirm', () => HttpResponse.json({ id: 'link1' })),
    )
    render(<FamilyLinkPanel accountPatientId="a1" onDone={onDone} />)
    const user = await pickBAndRelation()

    const code = await screen.findByLabelText('인증번호')
    await user.type(code, '123456')
    await user.click(screen.getByRole('button', { name: '확인' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  })

  test('번호 없는 B → 예외 갈래로 가고 대면·서류로 연결한다', async () => {
    const onDone = vi.fn()
    const linkSpy = vi.fn()
    server.use(
      http.post('*/patients/:id/family/:mid/verify-eligibility', () =>
        HttpResponse.json({ allowed: true, message: '' }),
      ),
      http.post('*/patients/:id/family', async ({ request }) => {
        linkSpy(await request.json())
        return HttpResponse.json({ id: 'link1' })
      }),
    )
    render(<FamilyLinkPanel accountPatientId="a1" onDone={onDone} />)
    const user = await pickBAndRelation()

    expect(await screen.findByText(/대면·서류로 본인을 확인/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '연결' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(linkSpy).toHaveBeenCalledWith({ family_patient_id: 'b1', relation: '배우자', method: 'in_person' })
  })

  test('[FAMILY-04] OTP에서 예외 입구를 눌러도 번호가 있으면 서버 문장을 보이며 머문다(우회 차단)', async () => {
    let calls = 0
    server.use(
      http.post('*/patients/:id/family/:mid/verify-eligibility', () => {
        calls += 1
        // 첫 판정(관계→이동): 번호 있음. 두 번째(예외 입구): 여전히 번호 있음.
        return HttpResponse.json({ allowed: false, message: '등록된 번호가 있어 다른 확인 방법으로 전환할 수 없습니다' })
      }),
      http.post('*/patients/:id/family/otp/request', () => HttpResponse.json({ ok: true })),
    )
    render(<FamilyLinkPanel accountPatientId="a1" onDone={() => {}} />)
    const user = await pickBAndRelation()

    await screen.findByText(/인증번호를 보냈습니다/)
    await user.click(screen.getByRole('button', { name: '등록 번호가 없나요?' }))
    // 예외로 넘어가지 않고(OTP 유지) 서버 문장을 보인다
    expect(await screen.findByText(/전환할 수 없습니다/)).toBeInTheDocument()
    expect(screen.getByLabelText('인증번호')).toBeInTheDocument()
    expect(screen.queryByText(/대면·서류로 본인을 확인/)).not.toBeInTheDocument()
  })
})
