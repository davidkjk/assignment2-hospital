import { render, screen, within } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { EmptyState } from './EmptyState'
import { InlineError } from './InlineError'

beforeEach(() => {
  // ERR-POS-02: jsdom엔 레이아웃이 없어 scrollIntoView가 없다 — 호출 여부만 본다.
  Element.prototype.scrollIntoView = vi.fn()
})

// ── EmptyState: 0건과 실패는 다른 말이다 ──────────────────────────────

test('[EMPTY-ZERO-01] 0건은 그 화면의 사실 문장을 그대로 보인다', () => {
  render(<EmptyState kind="zero" message="대기 중인 환자가 없습니다" />)
  expect(screen.getByText('대기 중인 환자가 없습니다')).toBeVisible()
})

test('[EMPTY-ERR-01] 조회 실패는 「정보를 불러오지 못했습니다」로 그린다', () => {
  render(<EmptyState kind="error" />)
  expect(screen.getByText('정보를 불러오지 못했습니다')).toBeVisible()
})

test('[EMPTY-ERR-01] 조회 실패에는 재시도 안내 문장을 함께 둔다', () => {
  render(<EmptyState kind="error" onRetry={vi.fn()} />)
  expect(screen.getByText('잠시 후 다시 시도해주세요')).toBeVisible()
})

test('[EMPTY-ZERO-02][ERR-RETRY-03] 0건에는 [다시 시도]를 두지 않는다', () => {
  // 실패가 아니라 사실이다 — 다시 시도해도 여전히 0건이다.
  render(<EmptyState kind="zero" message="대기 중인 환자가 없습니다" onRetry={vi.fn()} />)
  expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
})

test('[ERR-RETRY-02] 조회 실패에는 [다시 시도]를 만들어 준다', () => {
  // 조회는 화면 진입과 함께 저절로 일어나 다시 할 수단이 화면에 없다.
  render(<EmptyState kind="error" onRetry={vi.fn()} />)
  expect(screen.getByRole('button', { name: '다시 시도' })).toBeVisible()
})

test('[EMPTY-OFF-01] 오프라인은 연결 안내와 화면 이름 문장을 보인다', () => {
  render(<EmptyState kind="offline" screen="가족 목록" onRetry={vi.fn()} />)
  expect(screen.getByText('인터넷이 연결되어 있지 않습니다')).toBeVisible()
})

test('[EMPTY-LAY-02] 오프라인 문장에 화면 이름을 넣는다', () => {
  // 하얀 화면과의 결정적 차이는 「여기가 원래 무엇을 보여주는 곳인지」가 남는 것.
  render(<EmptyState kind="offline" screen="가족 목록" />)
  expect(screen.getByText('연결되면 가족 목록을 볼 수 있습니다')).toBeVisible()
})

test('[EMPTY-LAY-02] 받침 없는 화면 이름엔 「를」을 붙인다', () => {
  render(<EmptyState kind="offline" screen="사전문진표" />)
  expect(screen.getByText('연결되면 사전문진표를 볼 수 있습니다')).toBeVisible()
})

test('[EMPTY-LAY-01] 하얀 빈 화면이 아니라 아이콘을 둔다', () => {
  render(<EmptyState kind="zero" message="예약된 진료가 없습니다" />)
  expect(screen.getByTestId('empty-icon')).toBeVisible()
})

test('[EMPTY-LAY-01] 나가는 문(다음 행동)을 하나 둔다', () => {
  render(<EmptyState kind="zero" message="예약된 진료가 없습니다" action={<a href="/book">＋ 새 예약하기</a>} />)
  expect(within(screen.getByRole('status')).getByRole('link', { name: '＋ 새 예약하기' })).toBeVisible()
})

// ── InlineError: 동작 실패는 버튼 위 붙박이 ────────────────────────────

test('[ERR-POS-01][ERR-MSG-01] 서버 문장을 alert로 그대로 보인다', () => {
  render(<InlineError message="이미 예약이 찬 시간입니다. 다른 시간을 골라주세요." />)
  expect(screen.getByRole('alert')).toHaveTextContent('이미 예약이 찬 시간입니다. 다른 시간을 골라주세요.')
})

test('[ERR-POS-01] 좌측 4px 바 + 배경 없음(오프라인 띠와 다르게)', () => {
  render(<InlineError message="저장하지 못했습니다." />)
  expect(screen.getByRole('alert')).toHaveStyle({ borderLeftWidth: '4px' })
})

test('[ERR-POS-01] 배경색을 채우지 않는다', () => {
  render(<InlineError message="저장하지 못했습니다." />)
  expect(screen.getByRole('alert')).toHaveStyle({ background: 'none' })
})

test('[ERR-POS-02] 시야 밖일 수 있으니 그 위치로 스크롤한다', () => {
  // "눌렀는데 아무 일도 안 일어났다"로 보이는 것을 막는다.
  render(<InlineError message="저장하지 못했습니다." />)
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
})

test('[ERR-POS-03] 스낵바(자동 소멸)를 쓰지 않는다', () => {
  render(<InlineError message="저장하지 못했습니다." />)
  expect(document.querySelector('.snackbar')).toBeNull()
})
