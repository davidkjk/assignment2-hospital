import { screen, waitFor, within } from '@testing-library/react'
import { onlineManager } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { UserEvent } from '@testing-library/user-event'
import {
  renderQnaAdmin,
  routerLocation,
  goOffline,
  naegwaForm,
  naegwaQuestions,
  emptyForm,
  mkQuestion,
  type SetupConfig,
} from './testUtils'
import type { DepartmentForm, SavedVersion } from '../../../api/questionnaireAdmin'

beforeEach(() => {
  // react-query의 onlineManager는 전역 싱글턴이라 STATE-03의 goOffline()이 쏜 offline 이벤트가
  // 여기까지 남는다. offline인 채로 두면 다음 테스트의 쿼리가 paused되어 진료과 목록이 로딩에서 멈춘다.
  // navigator.onLine을 되돌리는 것만으론 부족해 onlineManager를 명시적으로 online으로 복원한다.
  onlineManager.setOnline(true)
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true })
  sessionStorage.clear()
})
afterEach(() => vi.restoreAllMocks())

async function openNaegwa(user: UserEvent) {
  await user.click(await screen.findByRole('button', { name: /내과/ }))
  await screen.findByText('내과 문진표')
}
function editorSaveButton() {
  return screen.getByRole('button', { name: '새 버전으로 저장' })
}
async function openSaveDialog(user: UserEvent) {
  await user.click(editorSaveButton())
  return screen.findByRole('dialog')
}
async function confirmSave(user: UserEvent) {
  const dialog = await openSaveDialog(user)
  await user.click(within(dialog).getByRole('button', { name: '새 버전으로 저장' }))
}

// ── 셸·권한 ─────────────────────────────────────────────

test('[QADM-SHELL-02] 의사가 URL로 들어오면 로그인으로 안 쫓고 갈 길을 준다', async () => {
  renderQnaAdmin({ role: 'doctor' })
  expect(await screen.findByText('이 화면을 볼 권한이 없습니다')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '진료 화면으로 가기' })).toBeInTheDocument()
})

test('[QADM-SHELL-02] 접수직원도 서버가 막고 기본 화면으로 보낸다', async () => {
  renderQnaAdmin({ role: 'receptionist' })
  expect(await screen.findByText('이 화면을 볼 권한이 없습니다')).toBeInTheDocument()
})

// ── 진료과 목록·선택 ─────────────────────────────────────

test('[QADM-DEPT-01] 진료과는 서버가 준 순서 그대로 — 화면에서 다시 정렬하지 않는다', async () => {
  renderQnaAdmin()
  const list = await screen.findByRole('list', { name: '진료과' })
  const names = within(list)
    .getAllByRole('button')
    .map((b) => within(b).getByTestId('dept-name').textContent)
  expect(names).toEqual(['내과', '정형외과', '산부인과'])
})

test('[QADM-DEPT-03] 진료과를 고르기 전에는 편집기 대신 안내가 뜬다', async () => {
  renderQnaAdmin()
  expect(await screen.findByText('진료과를 선택하면 문진표를 만들고 고칠 수 있습니다')).toBeInTheDocument()
  expect(screen.queryByLabelText(/department_id/i)).not.toBeInTheDocument()
})

test('[QADM-DEPT-02] 진료과를 고르면 같은 URL에서 양식·버전 기록이 함께 열린다', async () => {
  const { user } = renderQnaAdmin()
  await openNaegwa(user)
  expect(screen.getByText('현재 사용 v3')).toBeInTheDocument()
  expect(screen.getByRole('region', { name: '버전 기록' })).toBeInTheDocument()
  expect(routerLocation()).toContain('department_id=dept-1')
})

test('[QADM-DEPT-04] 양식이 없는 진료과는 빈 편집기와 첫 문항 안내를 연다', async () => {
  const { user } = renderQnaAdmin()
  await user.click(await screen.findByRole('button', { name: /산부인과/ }))
  expect(await screen.findByText('아직 문진표가 없습니다')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '첫 문항 추가' })).toBeInTheDocument()
  expect(screen.getByText('0문항으로 저장하면 이 진료과는 문진을 받지 않습니다')).toBeInTheDocument()
})

// ── 편집기 ─────────────────────────────────────────────

test('[QADM-FORM-01] 현재 버전 머리에 진료과·현재 버전·마지막 저장·새 버전 안내가 함께 있다', async () => {
  const { user } = renderQnaAdmin()
  await openNaegwa(user)
  expect(screen.getByText('내과 문진표')).toBeInTheDocument()
  expect(screen.getByText('현재 사용 v3')).toBeInTheDocument()
  expect(screen.getByText(/마지막 저장/)).toBeInTheDocument()
  expect(screen.getByText('저장하면 새 버전으로 남습니다')).toBeInTheDocument()
})

test('[QADM-FORM-02][QADM-FORM-03] 문항 ID를 보여주고 문구를 고쳐도 답변이 사라지지 않는다고 말한다', async () => {
  const { user } = renderQnaAdmin()
  await openNaegwa(user)
  expect(screen.getByText('Q-SYMPTOM-01')).toBeInTheDocument()
  expect(screen.getByText(/문항 ID는 답변을 붙이는 열쇠입니다/)).toBeInTheDocument()
})

test('[QADM-FORM-05] 질문 종류는 단답형·장문형·예/아니오 셋뿐이다', async () => {
  const { user } = renderQnaAdmin()
  await openNaegwa(user)
  const typeSelect = screen.getByLabelText('질문 종류 1') as HTMLSelectElement
  const options = within(typeSelect).getAllByRole('option').map((o) => o.textContent)
  expect(options).toEqual(['단답형', '장문형', '예/아니오'])
})

test('[QADM-FORM-06] 「병원이 꼭 확인」이 환자 입력을 막는 뜻이 아니라고 화면이 말한다', async () => {
  const { user } = renderQnaAdmin()
  await openNaegwa(user)
  expect(screen.getByText(/병원이 꼭 확인 표시는 환자 입력을 막는 뜻이 아닙니다/)).toBeInTheDocument()
})

test('[QADM-FORM-07] 보일 대상은 모든·여성·남성 셋뿐이다', async () => {
  const { user } = renderQnaAdmin()
  await openNaegwa(user)
  const showSelect = screen.getByLabelText('보일 대상 1') as HTMLSelectElement
  const options = within(showSelect).getAllByRole('option').map((o) => o.textContent)
  expect(options).toEqual(['모든 환자', '여성 환자만', '남성 환자만'])
})

test('[QADM-FORM-08] 첫 행의 [위로]와 마지막 행의 [아래로]는 눌리지 않는다', async () => {
  const { user } = renderQnaAdmin()
  await openNaegwa(user)
  const rows = screen.getAllByRole('group', { name: /문항 \d+/ })
  expect(within(rows[0]).getByRole('button', { name: '위로' })).toBeDisabled()
  expect(within(rows[rows.length - 1]).getByRole('button', { name: '아래로' })).toBeDisabled()
})

test('[QADM-FORM-08] 순서를 내려도 문항 ID는 그대로다', async () => {
  const { user } = renderQnaAdmin()
  await openNaegwa(user)
  const rows = () => screen.getAllByRole('group', { name: /문항 \d+/ })
  await user.click(within(rows()[0]).getByRole('button', { name: '아래로' }))
  const ids = rows().map((r) => within(r).getByTestId('question-id').textContent)
  expect(ids.slice(0, 2)).toEqual(['Q-ONSET-02', 'Q-SYMPTOM-01'])
})

test('[QADM-FORM-09][QADM-SAVE-03] 30문항에서 [문항 추가]가 막히고 갈 길을 준다', async () => {
  const many = Array.from({ length: 30 }, (_, i) => mkQuestion({ id: `Q-${i + 1}` }))
  const form: DepartmentForm = { ...naegwaForm(many), department_id: 'dept-1' }
  const { user } = renderQnaAdmin({ forms: { 'dept-1': form } })
  await openNaegwa(user)
  expect(screen.getByText('현재 30 / 최대 30')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '문항 추가' })).toBeDisabled()
  expect(screen.getByText('최대 30문항까지입니다')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '문항 수 줄이기' })).toBeInTheDocument()
})

test('[QADM-FORM-10] 저장 안 한 채 다른 진료과로 가려 하면 조용히 버리지 않는다', async () => {
  const { user } = renderQnaAdmin()
  await openNaegwa(user)
  await user.type(screen.getByLabelText('질문 문구 1'), '추가')
  expect(screen.getByText('저장되지 않은 변경')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: /정형외과/ }))
  expect(await screen.findByText('저장되지 않은 변경이 있습니다')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '계속 편집' }))
  expect(screen.getByText('내과 문진표')).toBeInTheDocument()
})

// ── 버전·저장 ───────────────────────────────────────────

test('[QADM-VERSION-02] 저장 전에 버전이 어떻게 바뀌는지 확인창이 먼저 말한다', async () => {
  const { user, api } = renderQnaAdmin()
  await openNaegwa(user)
  await user.type(screen.getByLabelText('질문 문구 1'), '수정')
  const dialog = await openSaveDialog(user)
  expect(dialog).toHaveTextContent('v3 → v4')
  expect(dialog).toHaveTextContent('과거 답변은 그대로 보존됩니다')
  expect(api.postCalls()).toHaveLength(0)
})

test('[QADM-VERSION-05] 작성 중인 환자가 있다는 것을 저장 전에 알려준다', async () => {
  const { user } = renderQnaAdmin()
  await openNaegwa(user)
  const dialog = await openSaveDialog(user)
  expect(dialog).toHaveTextContent('작성 중인 환자는 다음에 다시 열 때 새 문항으로 이어집니다')
})

test('[QADM-VERSION-01] 저장은 덮어쓰기가 아니라 현재 버전을 base로 새 버전을 만든다', async () => {
  const { user, api } = renderQnaAdmin()
  await openNaegwa(user)
  await confirmSave(user)
  await waitFor(() => expect(api.postCalls()).toHaveLength(1))
  const call = api.postCalls()[0]
  expect(call.path).toBe('/admin/questionnaires/dept-1/versions')
  expect((call.body as { base_version_id: string }).base_version_id).toBe('v3-id')
})

test('[QADM-SAVE-01] 저장에 성공하면 새 버전 번호와 보존 안내를 함께 보여준다', async () => {
  const { user } = renderQnaAdmin()
  await openNaegwa(user)
  await confirmSave(user)
  expect(await screen.findByText('v4로 저장했습니다. 과거 답변은 그대로 보존됩니다.')).toBeInTheDocument()
  expect(screen.getByText('현재 사용 v4')).toBeInTheDocument()
  expect(screen.queryByText('저장되지 않은 변경')).not.toBeInTheDocument()
})

test('[QADM-SAVE-02][QADM-VERSION-07] 0문항 저장을 막지 않고 뜻을 설명한다', async () => {
  const { user } = renderQnaAdmin()
  await openNaegwa(user)
  const rows = () => screen.queryAllByRole('group', { name: /문항 \d+/ })
  while (rows().length > 0) {
    await user.click(within(rows()[0]).getByRole('button', { name: '삭제' }))
  }
  await confirmSave(user)
  expect(await screen.findByText('이 진료과는 현재 문진을 받지 않습니다. 이전 답변은 남아 있습니다.')).toBeInTheDocument()
})

test('[QADM-SAVE-04] 저장이 실패해도 입력과 현재 버전 표시가 그대로 남는다', async () => {
  const { user, api } = renderQnaAdmin()
  await openNaegwa(user)
  await user.type(screen.getByLabelText('질문 문구 1'), '수정')
  api.respond('POST /admin/questionnaires/dept-1/versions', 500, '저장하지 못했습니다. 잠시 후 다시 시도해주세요.')
  await confirmSave(user)
  expect(await screen.findByRole('alert')).toHaveTextContent('저장하지 못했습니다')
  expect((screen.getByLabelText('질문 문구 1') as HTMLTextAreaElement).value).toContain('수정')
  expect(screen.getByText('현재 사용 v3')).toBeInTheDocument()
})

test('[QADM-SAVE-05] 다른 관리자가 먼저 저장했으면 덮어쓰지 않고 최신을 불러올 길을 준다', async () => {
  const { user, api } = renderQnaAdmin()
  await openNaegwa(user)
  api.respond('POST /admin/questionnaires/dept-1/versions', 409, '다른 관리자가 먼저 저장했습니다. 최신 문진표를 불러오세요.')
  await confirmSave(user)
  expect(await screen.findByText(/다른 관리자가 먼저 저장했습니다/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '최신 문진표 불러오기' })).toBeInTheDocument()
  expect(screen.getByLabelText('질문 문구 1')).toBeInTheDocument()
})

test('[QADM-SAVE-06] 저장한 직원 정보가 없으면 기록에 「직원 정보 없음」으로 남는다', async () => {
  const form = naegwaForm()
  form.versions[1] = { ...form.versions[1], created_by_name: '직원 정보 없음' }
  const { user } = renderQnaAdmin({ forms: { 'dept-1': form } })
  await openNaegwa(user)
  const history = screen.getByRole('region', { name: '버전 기록' })
  expect(within(history).getByText(/직원 정보 없음/)).toBeInTheDocument()
})

// ── 버전 기록 ───────────────────────────────────────────

test('[QADM-VERSION-03][AD-066] 버전 기록에 삭제·숨김·이름 조작이 없다', async () => {
  const { user } = renderQnaAdmin()
  await openNaegwa(user)
  const history = screen.getByRole('region', { name: '버전 기록' })
  expect(within(history).getByText('v3')).toBeInTheDocument()
  expect(within(history).getByText(/김관리자/)).toBeInTheDocument()
  expect(within(history).queryByRole('button', { name: /삭제|숨기기|이름/ })).not.toBeInTheDocument()
  expect(within(history).queryByRole('textbox')).not.toBeInTheDocument()
})

test('[QADM-VERSION-04] 과거 버전은 같은 화면에서 읽기 전용으로만 열린다', async () => {
  const versions: Record<string, SavedVersion> = {
    'v2-id': {
      id: 'v2-id',
      department_id: 'dept-1',
      version_no: 2,
      is_active: false,
      created_at: '2026-07-12T16:20:00+09:00',
      created_by_name: '박관리자',
      questions: naegwaQuestions().slice(0, 4),
    },
  }
  const { user } = renderQnaAdmin({ versions })
  await openNaegwa(user)
  await user.click(screen.getByRole('button', { name: 'v2 문항 보기' }))
  const preview = await screen.findByRole('region', { name: /v2/ })
  expect(within(preview).queryByRole('textbox')).not.toBeInTheDocument()
  expect(within(preview).queryByRole('button', { name: /되돌리기|삭제|수정/ })).not.toBeInTheDocument()
  expect(screen.getByText('내과 문진표')).toBeInTheDocument()
})

// ── 로딩·예외 ───────────────────────────────────────────

test('[QADM-STATE-01] 불러오는 동안 이전 진료과의 문항이 섞여 보이지 않는다', async () => {
  const { user, api } = renderQnaAdmin()
  await openNaegwa(user)
  api.pauseForm()
  await user.click(screen.getByRole('button', { name: /정형외과/ }))
  expect(await screen.findByText('문진표를 불러오는 중입니다')).toBeInTheDocument()
  expect(screen.queryByText('Q-SYMPTOM-01')).not.toBeInTheDocument()
  expect(screen.getByRole('list', { name: '진료과' })).toBeInTheDocument()
})

test('[QADM-STATE-02] 조회에 실패해도 화면을 옮기지 않고 다시 시도할 길을 준다', async () => {
  const { user, api } = renderQnaAdmin()
  api.respond('GET /admin/questionnaires/dept-1', 500, '문진표를 불러오지 못했습니다')
  await user.click(await screen.findByRole('button', { name: /내과/ }))
  expect(await screen.findByText('정보를 불러오지 못했습니다')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
})

test('[QADM-STATE-03] 오프라인에서 저장을 성공처럼 보이지 않고 저장을 막는다', async () => {
  const { user } = renderQnaAdmin()
  await openNaegwa(user)
  goOffline()
  expect(await screen.findByText('연결되면 문진표를 저장할 수 있습니다')).toBeInTheDocument()
  expect(editorSaveButton()).toBeDisabled()
})

test('[QADM-STATE-04] 세션이 만료돼도 자동 재제출하지 않고 다시 로그인 길을 준다', async () => {
  const { user, api } = renderQnaAdmin()
  await openNaegwa(user)
  api.respond('POST /admin/questionnaires/dept-1/versions', 401, '세션이 만료되었습니다.')
  await confirmSave(user)
  expect(await screen.findByText(/다시 로그인/)).toBeInTheDocument()
  expect(api.postCalls()).toHaveLength(1)
  const stored = JSON.parse(sessionStorage.getItem('staff-session-return') ?? '{}')
  expect(stored.path).toBe('/admin/questionnaires')
})
