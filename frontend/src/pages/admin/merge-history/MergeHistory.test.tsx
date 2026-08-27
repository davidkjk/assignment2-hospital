import { test, expect } from 'vitest'
import { screen, within } from '@testing-library/react'
import {
  renderApp,
  renderMergeHistory,
  renderEvent,
  reload,
  sidebarActive,
  listApiCall,
  row,
  reviewButton,
  continueButton,
  reasonBox,
  openConfirm,
  confirmUndo,
  memoBox,
  returnTo,
  user,
  location,
  undoApi,
  mergeCreateApi,
  notesApi,
  api,
} from './testUtils'

// [MHIST-*] 병합 되돌림 이력 — 목록 → 상세 → 사유 → 확인창 → 완료 / 잠김 → 대상 환자·감사메모.
// 6단계를 한 상태기계로 닫는다. 비가역·파괴적이라 빨간 버튼은 확인창 안·읽음 체크 뒤에만 열린다.

test('[MHIST-SHELL-01][MHIST-NAV-01] 사이드바 「병합 이력」이 현재 셸을 유지한 채 목록을 연다', async () => {
  renderApp({ route: '/today', role: 'admin' })
  await user.click(screen.getByRole('link', { name: '병합 이력' }))
  expect(location.pathname).toBe('/admin/merge-history')
  expect(sidebarActive()).toBe('병합 이력')
})

test('[MHIST-SHELL-02][MHIST-EXC-01] 관리자 아닌 역할은 권한 안내 + 기본 화면으로, /login이 아니다', () => {
  renderApp({ route: '/admin/merge-history', role: 'receptionist' })
  // 거부는 페이지가 감싼 RequireRole 표준 출력이다(형제 MERGE-SHELL-02와 같은 문구·같은 출구).
  // 규칙 MHIST-SHELL-02/EXC-01은 「권한 안내 + 역할 기본 화면, /login 아님」만 요구하고 특정 문구를
  // 정하지 않으므로, 앱 전역 admin 화면과 일관된 RequireRole 문구를 쓴다.
  expect(screen.getByText(/이 화면을 볼 권한이 없습니다/)).toBeVisible()
  expect(screen.getByRole('button', { name: '오늘의 현황으로 가기' })).toBeVisible()   // 역할 기본 화면
  expect(location.pathname).not.toBe('/login')
})

test('[MHIST-SHELL-03] 새로고침은 같은 목록·필터 문맥을 다시 읽는다', async () => {
  renderMergeHistory(); await reload()
  expect(location.pathname).toBe('/admin/merge-history')
  expect(listApiCall()).toBeTruthy()
})

test('[MHIST-LIST-01] 행에 시각·실행자·대표/대상·상태가 있고, 즉시 되돌림 버튼은 없다', () => {
  renderMergeHistory({ rows: [{ status: 'undoable', primary: { masked_name: '홍*동' },
                                merged: { masked_name: '홍*똥' }, executed_by: '김관리' }] })
  const r = row(0)
  expect(within(r).getByText('홍*동')).toBeVisible()
  expect(within(r).getByText('되돌림 가능')).toBeVisible()
  expect(within(r).queryByRole('button', { name: /되돌림 확정|되돌리기/ })).toBeNull()  // 목록엔 없다
})

test('[MHIST-LIST-04][MHIST-NAV-02] 행/[상세 보기]를 누르면 그 이벤트 상세로 간다', async () => {
  renderMergeHistory({ rows: [{ merge_event_id: 'm1', status: 'undoable' }] })
  await user.click(within(row(0)).getByRole('button', { name: '상세 보기' }))
  expect(location.pathname).toBe('/admin/merge-history/m1')
})

test('[MHIST-DETAIL-02][MHIST-DETAIL-03][MHIST-NAV-03] 상세는 보존 상태를 읽기전용으로 보이고, 가능하면 [되돌림 검토]', () => {
  renderEvent({ undo_status: 'undoable', preservation: { merged: { appointments: 3 } } })
  expect(screen.getByText(/예약 3건 보존/)).toBeVisible()
  expect(screen.getByRole('button', { name: '되돌림 검토' })).toBeEnabled()
})

test('[MHIST-REASON-01][MHIST-EXC-06][MHIST-REASON-03] 사유 1~200자, 유효할 때만 [확인으로 계속]', async () => {
  renderEvent({ undo_status: 'undoable' }); await user.click(reviewButton())
  expect(continueButton()).toBeDisabled()                       // 0자
  await user.type(reasonBox(), '가'.repeat(201))
  expect(reasonBox()).toHaveValue('가'.repeat(200))             // 200 초과 입력 안 받음
  expect(screen.getByText('200/200')).toBeVisible()
  await user.clear(reasonBox()); await user.type(reasonBox(), '본인 아님')
  expect(continueButton()).toBeEnabled()
  expect(undoApi).not.toHaveBeenCalled()                        // 입력 중 서버 호출 안 함
})

test('[MHIST-CONFIRM-01][MHIST-CONFIRM-02][MHIST-NAV-04] 사유 입력 뒤 확인창이 열리고, 보존·열람불가·감사잔존을 말하며 읽음 체크 후에만 확정', async () => {
  await openConfirm({ reason: '본인 아님' })                    // MHIST-NAV-04: 사유 → 확인창 전이
  const dlg = screen.getByRole('dialog')
  expect(dlg).toBeVisible()                                     // NAV-04 — 유효 사유가 확인창을 연다
  expect(dlg).toHaveTextContent('원본 예약·문진·의료기록·감사기록은 지워지지 않습니다')
  expect(dlg).toHaveTextContent('이미 열람된 기록은 되돌릴 수 없습니다')
  expect(within(dlg).getByRole('button', { name: '되돌림 확정' })).toBeDisabled()  // 체크 전
  await user.click(within(dlg).getByRole('checkbox', { name: /읽었습니다/ }))
  expect(within(dlg).getByRole('button', { name: '되돌림 확정' })).toBeEnabled()
  expect(within(dlg).getByRole('button', { name: '되돌림 확정' })).toHaveClass('danger')  // 빨강은 확인창 안에서만
})

test('[MHIST-CONFIRM-03][MHIST-NAV-06][MHIST-REASON-02] 확정은 최신 상태 재검증 뒤에만·중복 클릭 차단, 같은 이벤트를 유지하고 새 병합을 안 만든다', async () => {
  await openConfirm({ reason: '본인 아님', checked: true })
  const btn = screen.getByRole('button', { name: '되돌림 확정' })
  await user.dblClick(btn)
  expect(undoApi).toHaveBeenCalledTimes(1)                      // 처리 중 두 번째 클릭 무시
  // MHIST-REASON-02 — 선택한 merge_event_id를 그대로 실어 보낸다(새 병합 이벤트를 만들지 않는다).
  expect(undoApi).toHaveBeenCalledWith('m1', expect.objectContaining({
    expected_status: 'undoable', reason: '본인 아님' }))
  expect(mergeCreateApi).not.toHaveBeenCalled()                // 새 병합 없음
})

test('[MHIST-DONE-01][MHIST-DONE-02][MHIST-NAV-07] 완료는 요약을 보이고 [이력으로 돌아가기]가 최신 목록으로', async () => {
  await confirmUndo({ result: { status: 'undone' } })
  expect(screen.getByText('되돌림 완료')).toBeVisible()
  expect(screen.getByText(/원본 예약·문진·의료기록.*지우지 않았습니다/)).toBeVisible()
  await user.click(screen.getByRole('button', { name: '이력으로 돌아가기' }))
  expect(location.pathname).toBe('/admin/merge-history')
  expect(within(row('m1')).getByText('되돌림 완료')).toBeVisible()   // 되돌림 가능으로 다시 안 보임
})

test('[MHIST-EXC-05] 확정 때 409면 「이미 되돌림 처리됨」을 보이고 확정 버튼을 없앤다', async () => {
  await openConfirm({ reason: 'x', checked: true })
  api.respond('POST /admin/merge-history/m1/undo', 409)
  await user.click(screen.getByRole('button', { name: '되돌림 확정' }))
  expect(screen.getByText('이미 되돌림 처리됨')).toBeVisible()
  expect(screen.queryByRole('button', { name: '되돌림 확정' })).toBeNull()
  expect(screen.getByRole('button', { name: '이력으로 돌아가기' })).toBeVisible()
})

test('[MHIST-LOCK-01][MHIST-LOCK-02][MHIST-NAV-08] 되돌림불가면 사유를 읽기전용으로, [대상 환자 열기]·[감사메모 저장]을 준다', async () => {
  renderEvent({ undo_status: 'locked', lock_reason: '병합 뒤 대표 환자에 새 진료기록 2건이 생겨 되돌릴 수 없습니다',
                merged: { patient_id: 'p-merged' } })
  expect(screen.getByText(/새 진료기록 2건/)).toBeVisible()
  expect(screen.queryByRole('button', { name: '되돌림 검토' })).not.toBeInTheDocument()  // 되돌림 없음
  await user.click(screen.getByRole('button', { name: '대상 환자 열기' }))
  expect(location.pathname).toBe('/patients/p-merged')           // 막다른 길이 아니다
})

test('[MHIST-LOCK-02 감사메모] 감사메모 저장은 대상 환자 내부 메모로 남기고 되돌림 성공으로 표현 안 함', async () => {
  renderEvent({ undo_status: 'locked', merged: { patient_id: 'p-merged' }, merge_event_id: 'm1' })
  await user.click(screen.getByRole('button', { name: '감사메모 저장' }))
  await user.type(memoBox(), '본인 주장 접수, 문서 확인 예정')
  await user.click(screen.getByRole('button', { name: '메모 저장' }))
  expect(notesApi).toHaveBeenCalledWith('p-merged', expect.objectContaining({
    body: expect.stringContaining('병합 이벤트 m1') }))           // MHIST-LOCK-03 운영 참고
  expect(screen.queryByText('되돌림 완료')).toBeNull()            // 성공으로 표현 안 함
})

test('[MHIST-EXC-04] 이력이 0건이면 안내 + [병합 후보 보기], 조회 [다시 시도]는 안 붙인다', () => {
  renderMergeHistory({ rows: [], count: 0 })
  expect(screen.getByText('병합 되돌림 이력이 없습니다')).toBeVisible()
  expect(screen.getByRole('button', { name: '병합 후보 보기' })).toBeVisible()
  expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()  // 0건은 오류가 아니다
})

test('[MHIST-EXC-02] 오프라인이면 route 유지·배너, 되돌림·사유·확정은 잠기되 이유를 붙인다', async () => {
  renderEvent({ undo_status: 'undoable', online: false })
  expect(screen.getByRole('status', { name: /인터넷이 연결/ })).toBeVisible()
  expect(screen.getByRole('button', { name: '되돌림 검토' })).toBeDisabled()
  expect(screen.getByText(/연결되면 되돌릴 수 있습니다/)).toBeVisible()     // 이유 없는 회색 금지
  expect(location.pathname).toContain('/admin/merge-history')
})

test('[MHIST-EXC-03] 온라인 401만 세션 만료로 로그인으로 보내고 돌아올 곳을 기억한다', async () => {
  renderEvent({ undo_status: 'undoable' })
  api.respond('POST /admin/merge-history/m1/undo', 401)
  await confirmUndo({ reason: 'x', checked: true })
  expect(location.pathname).toBe('/login')
  expect(returnTo()).toBe('/admin/merge-history/m1')
  expect(returnTo()).not.toMatch(/본인|사유/)                    // 미제출 사유를 세션 밖에 안 남긴다
})

test('[MHIST-NAV-05] 사유·확인창의 [취소]·[상세로]는 이벤트 상세로 돌아가고 아무것도 안 바꾼다', async () => {
  await openConfirm({ reason: 'x' })
  await user.click(screen.getByRole('button', { name: '취소' }))
  expect(location.pathname).toBe('/admin/merge-history/m1')
  expect(undoApi).not.toHaveBeenCalled()
})
