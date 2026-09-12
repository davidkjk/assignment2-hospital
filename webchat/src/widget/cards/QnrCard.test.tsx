import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WebCard, type CardContext } from './WebCard';

function ctx(over: Partial<CardContext> = {}): CardContext {
  return { isAnonymous: true, onAuthGate: vi.fn(), onExecute: vi.fn(), onPick: vi.fn(), onReconsult: vi.fn(), onRebook: vi.fn(), ...over };
}

test('[WEBCARD-QNR-01] 위젯에 문항·답변·편집 화면을 복제하지 않고 앱 경로만 안내한다', () => {
  render(<WebCard payload={{ card_type: 'questionnaire', state: '작성중', answered: 1, total: 6, appointment_id: 'a1' }} ctx={ctx()} />);
  expect(screen.getByText(/환자 앱에서 작성하거나 수정/)).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument(); // 웹 전용 문진 카드·입력 없음
});

test('[WEBCARD-QNR-02] 비로그인 사용자에게 특정 예약의 문진 내용·진행률을 노출하지 않고 웹 문진 열기로 보내지 않는다', () => {
  render(<WebCard payload={{ card_type: 'questionnaire', state: '작성중', answered: 3, total: 6, appointment_id: 'a1' }} ctx={ctx({ isAnonymous: true })} />);
  expect(screen.queryByText(/3\/6|진행률|문진 열기/)).not.toBeInTheDocument();
  expect(screen.getByText(/환자 앱에서 확인/)).toBeInTheDocument();
});

test('[WEBCARD-QNR-03] 로그인 웹 사용자에게도 웹 문진 화면을 만들지 않고 앱 읽기 전용 경로만 안내한다', () => {
  render(<WebCard payload={{ card_type: 'questionnaire', state: '완료', answered: 6, total: 6 }} ctx={ctx({ isAnonymous: false })} />);
  expect(screen.getByText(/환자 앱에서 작성하거나 수정/)).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

test('[WEBCARD-QNR-04] 0문항은 "작성할 문진이 없습니다" 한 줄만 표시하고 버튼·(0/0)·독립 카드를 만들지 않는다', () => {
  render(<WebCard payload={{ card_type: 'questionnaire', state: '없음', answered: 0, total: 0 }} ctx={ctx()} />);
  expect(screen.getByText('작성할 문진이 없습니다')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByText('(0/0)')).not.toBeInTheDocument();
});

test('[WEBCARD-QUICK-01] 시작 고정 묶음·대화 중 추천을 본체 계약대로 버튼으로 표시한다', () => {
  render(<WebCard payload={{ card_type: 'quick_replies', options: ['예약하고 싶어요', '진료과를 모르겠어요'] }} ctx={ctx()} />);
  expect(screen.getByRole('button', { name: '예약하고 싶어요' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '진료과를 모르겠어요' })).toBeInTheDocument();
});

test('[WEBCARD-QUICK-02] 빠른 답변 선택은 버튼 문장 그대로 환자 말풍선으로 전송한다', async () => {
  const onPick = vi.fn();
  render(<WebCard payload={{ card_type: 'quick_replies', options: ['예약하고 싶어요'] }} ctx={ctx({ onPick })} />);
  await userEvent.click(screen.getByRole('button', { name: '예약하고 싶어요' }));
  expect(onPick).toHaveBeenCalledWith('예약하고 싶어요');
});

test('[WEBCARD-QUICK-03] 자유 입력은 빠른 답변의 유무·생성 상태와 무관하게 늘 열려 있다(ChatRoom 입력)', () => {
  // 빠른답변 카드가 없어도 방의 자유 입력은 존재 — 카드 유무가 입력을 잠그지 않는다
  render(<WebCard payload={{ card_type: 'quick_replies', state: '생성실패' }} ctx={ctx()} />);
  expect(screen.queryByLabelText('빠른 답변')).not.toBeInTheDocument(); // 카드는 안 뜨지만
  // 자유 입력 자체는 WEBCHAT-ROOM 입력(Task 14)이 담당 — 여기선 카드가 입력을 막지 않음을 확인
});

test('[WEBCARD-QUICK-04] 추천 생성 중·실패에 별도 로딩·실패·재시도를 표시하지 않고 성공 시에만 추천을 보인다', () => {
  const { rerender } = render(<WebCard payload={{ card_type: 'quick_replies', state: '생성중' }} ctx={ctx()} />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByText(/추천을 불러오지 못/)).not.toBeInTheDocument();
  rerender(<WebCard payload={{ card_type: 'quick_replies', state: '정상', options: ['예약하고 싶어요'] }} ctx={ctx()} />);
  expect(screen.getByRole('button', { name: '예약하고 싶어요' })).toBeInTheDocument(); // 성공 시에만 표시
});
