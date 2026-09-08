import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { expect, test } from 'vitest'
import { rightColumn, rowOf, setupStaff } from './testUtils'
import { server } from '../../../test/msw/server'

// [STAFF-INVITE-*] 초대 폼. 오른쪽 칸에 붙박이로 있다.

function roleOptions(): string[] {
  const group = within(rightColumn()).getByRole('group', { name: '역할' })
  return within(group)
    .getAllByRole('button')
    .map((b) => b.textContent ?? '')
    .filter(Boolean)
}

async function inviteDoctor(user: UserEvent, name = '정다은'): Promise<void> {
  await user.type(within(rightColumn()).getByLabelText('이메일'), 'new-doctor@lunahospital.test')
  await user.type(within(rightColumn()).getByLabelText('이름'), name)
  await user.click(within(rightColumn()).getByRole('button', { name: '의사' }))
  await user.selectOptions(within(rightColumn()).getByLabelText('소속 진료과'), '내과')
  await user.click(within(rightColumn()).getByRole('button', { name: '초대' }))
}

test('[STAFF-INVITE-01] 비밀번호 칸이 없다', async () => {
  setupStaff()
  await screen.findByText('이민호')
  expect(within(rightColumn()).queryByLabelText(/비밀번호/)).toBeNull()
})

test('[STAFF-INVITE-02] 역할은 접수직원·의사·관리자 셋뿐이다', async () => {
  setupStaff()
  await screen.findByText('이민호')
  expect(roleOptions()).toEqual(['접수직원', '의사', '관리자'])
})

test('[STAFF-INVITE-03] 의사를 고르면 진료과 미선택은 서버에 보내기 전에 막힌다', async () => {
  const { user, api } = setupStaff()
  await screen.findByText('이민호')
  await user.type(within(rightColumn()).getByLabelText('이메일'), 'd@lunahospital.test')
  await user.type(within(rightColumn()).getByLabelText('이름'), '무소속')
  await user.click(within(rightColumn()).getByRole('button', { name: '의사' }))
  await user.click(within(rightColumn()).getByRole('button', { name: '초대' }))
  expect(within(rightColumn()).getByText('의사는 소속 진료과를 선택해야 합니다.')).toBeVisible()
  expect(api.calls('POST /staff')).toHaveLength(0)
})

test('[STAFF-INVITE-03] 진료과 선택지는 사용 중인 진료과만이다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await user.click(within(rightColumn()).getByRole('button', { name: '의사' }))
  const select = within(rightColumn()).getByLabelText('소속 진료과') as HTMLSelectElement
  const names = Array.from(select.options).map((o) => o.textContent)
  expect(names).toContain('내과')
  expect(names).not.toContain('폐과된과')
})

test('[STAFF-INVITE-04] 성공하면 폼을 비운다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await inviteDoctor(user)
  // [하이브리드] 도메인 인증 후 초대 메일을 자동 발송한다(email_sent) → 「초대 메일을 보냈습니다」.
  expect(await screen.findByText('초대 메일을 보냈습니다')).toBeVisible()
  expect(within(rightColumn()).getByLabelText('이메일')).toHaveValue('')
})

test('[STAFF-INVITE-LINK-01·하이브리드] 성공하면 메일을 보내면서 전달용 링크와 복사 버튼도 보여준다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await inviteDoctor(user)
  // 메일을 자동 발송하면서도(막다른 길 대비) 관리자가 직접 전달할 링크를 함께 노출한다.
  const link = await within(rightColumn()).findByLabelText('초대 링크')
  expect(link).toHaveValue('https://staff.test/reset-password/new?token=tok-s-new-7')
  expect(within(rightColumn()).getByRole('button', { name: '링크 복사' })).toBeVisible()
})

test('[STAFF-INVITE-04] 성공하면 새 직원이 초대 딱지를 달고 목록에 나타난다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')
  await inviteDoctor(user, '정다은')
  await waitFor(() => expect(rowOf('정다은')).toHaveTextContent('초대함 · 아직 안 들어옴'))
})

test('[STAFF-INVITE-05] 실패하면 입력한 이메일을 남긴다', async () => {
  const { user, api } = setupStaff()
  await screen.findByText('이민호')
  api.fail('POST /staff')
  await inviteDoctor(user)
  expect(within(rightColumn()).getByLabelText('이메일')).toHaveValue('new-doctor@lunahospital.test')
})

test('[STAFF-INVITE-05] 실패하면 버튼 가까이 이유와 [다시 시도]를 둔다', async () => {
  const { user, api } = setupStaff()
  await screen.findByText('이민호')
  api.fail('POST /staff')
  await inviteDoctor(user)
  expect(await within(rightColumn()).findByText('초대에 실패했습니다')).toBeVisible()
  expect(within(rightColumn()).getByRole('button', { name: '다시 시도' })).toBeVisible()
})

// [STAFF-INVITE-11] 느려서 두 번 눌러도(엔터·연타) 초대는 한 번만 나간다 — 재진입 금지.
// 회귀: 이중 전송이면 첫 요청만 성공(링크)하고 둘째가 서버 유니크 위반으로 500이 나
// 「성공 링크 + 실패 배너」가 한 화면에 겹쳐 보였다(2026-09-08 스크린샷).
test('[STAFF-INVITE-11] 동시 이중 전송은 POST /staff를 한 번만 보내고 성공/실패를 섞지 않는다', async () => {
  const { user } = setupStaff()
  await screen.findByText('이민호')

  let n = 0
  let releaseFirst!: () => void
  const gate = new Promise<void>((r) => {
    releaseFirst = r
  })
  server.use(
    http.post('*/staff', async () => {
      n += 1
      if (n === 1) {
        await gate // 첫 요청을 붙잡아 둘째가 「동시에」 뜰 여지를 만든다.
        return HttpResponse.json(
          { staff_id: 's1', invite_link: 'https://staff.test/reset-password/new?token=first', email_sent: false },
          { status: 200 },
        )
      }
      // 두 번째가 나가면(레이스) 서버 유니크 위반 → 미처리 500을 흉내낸다.
      return HttpResponse.json(
        { detail: '잠시 후 다시 시도해주세요. 문제가 계속되면 관리자에게 문의하세요.' },
        { status: 500 },
      )
    }),
  )

  await user.type(within(rightColumn()).getByLabelText('이메일'), 'staff@gaon.kr')
  await user.type(within(rightColumn()).getByLabelText('이름'), '홍길동')

  const form = within(rightColumn()).getByRole('form', { name: '직원 초대' })
  fireEvent.submit(form) // 첫 전송(붙잡힘)
  fireEvent.submit(form) // 곧바로 둘째 전송 — 가드가 막아야 한다

  // 첫 요청이 서버에 닿을 때까지 기다린 뒤 풀어준다.
  await waitFor(() => expect(n).toBeGreaterThan(0))
  releaseFirst()

  // 링크가 뜰 때까지 기다린 뒤 상태를 확인한다.
  await within(rightColumn()).findByLabelText('초대 링크')
  expect(n).toBe(1) // 초대는 한 번만 나갔다
  expect(within(rightColumn()).queryByText(/문제가 계속되면/)).toBeNull() // 실패 배너 없음
  expect(within(rightColumn()).queryByRole('button', { name: '다시 시도' })).toBeNull()
})
