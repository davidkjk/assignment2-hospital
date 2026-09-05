import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatRoom } from './ChatRoom';
import type { ThreadMessage } from '../api/webchatApi';

const base = {
  onSend: () => {}, onResend: () => {}, onRetryLoad: () => {},
  guideSlot: null, handoffSlot: null, renderCard: () => null,
};

test('[WEBCHAT-ROOM-01] 자기완결 위젯 경계 — 전체화면이 아니라 위젯 영역으로 표시', () => {
  render(<ChatRoom phase="ready" messages={[]} {...base} />);
  const region = screen.getByRole('region', { name: 'AI 상담봇' });
  expect(region).toHaveAttribute('data-widget', 'true'); // 테두리·그림자 위젯(홈페이지와 분리)
});

test('[WEBCHAT-ROOM-02] 머리말은 `AI 상담봇` + 같은 문맥에 가이드/인계 슬롯', () => {
  render(<ChatRoom phase="ready" messages={[]} {...base}
    guideSlot={<div>추천 진행 중</div>} handoffSlot={<div>대기중</div>} />);
  expect(screen.getByRole('banner')).toHaveTextContent('AI 상담봇');
  expect(screen.getByText('추천 진행 중')).toBeInTheDocument();
  expect(screen.getByText('대기중')).toBeInTheDocument();
});

test('[WEBCHAT-ROOM-03] 첫 상담이면 빈 오류가 아니라 첫 안내 + 자유 입력', () => {
  render(<ChatRoom phase="firstConsult" messages={[]} {...base} />);
  expect(screen.getByPlaceholderText('메시지를 입력하세요')).toBeEnabled(); // 자유 입력 열림
  expect(screen.queryByText(/오류|실패/)).not.toBeInTheDocument();
});

test('[WEBCHAT-ROOM-03] 첫 안내(startSlot·시작 고정 묶음)를 빈 피드일 때 대화 안에 표시한다', () => {
  // WEBCHAT-ROOM-03 「첫 안내」 + WEBCARD-QUICK-01 「시작 고정 묶음」 = 봇 인사말·시작 칩을 대화 영역에 렌더.
  render(<ChatRoom phase="ready" messages={[]} {...base} startSlot={<div>시작안내블록</div>} />);
  expect(screen.getByText('시작안내블록')).toBeInTheDocument();
});

test('[WEBCHAT-ROOM-03] 대화가 시작되면(메시지 있음) 시작 안내를 감춘다', () => {
  // 시작 고정 묶음은 첫 상담(피드 0건)에만 — 대화가 시작되면 사라진다(홈페이지 챗봇과 동일).
  const msgs: ThreadMessage[] = [{ id: 'm1', senderType: 'patient', messageType: 'text', content: '안녕', sendState: 'sent' }];
  render(<ChatRoom phase="ready" messages={msgs} {...base} startSlot={<div>시작안내블록</div>} />);
  expect(screen.queryByText('시작안내블록')).not.toBeInTheDocument();
});

test('[WEBCHAT-ROOM-03] 조회 오류·복원 중에는 시작 안내를 표시하지 않는다', () => {
  // loadError는 [다시 시도] 화면, restoring은 로딩 표시 — 빈 피드라도 시작 안내로 가장하지 않는다.
  const { rerender } = render(<ChatRoom phase="loadError" messages={[]} {...base} startSlot={<div>시작안내블록</div>} />);
  expect(screen.queryByText('시작안내블록')).not.toBeInTheDocument();
  rerender(<ChatRoom phase="restoring" messages={[]} {...base} startSlot={<div>시작안내블록</div>} />);
  expect(screen.queryByText('시작안내블록')).not.toBeInTheDocument();
});

test('[WEBCHAT-ROOM-06] 로딩 중이면 로딩 표시 — 기존 메시지를 가리지 않는다', () => {
  const msgs: ThreadMessage[] = [{ id: 'm1', senderType: 'bot', messageType: 'text', content: '안녕하세요' }];
  render(<ChatRoom phase="restoring" messages={msgs} {...base} />);
  expect(screen.getByRole('status')).toHaveTextContent('불러오는 중'); // 조회 중
  expect(screen.getByText('안녕하세요')).toBeInTheDocument();          // 과거 메시지 유지
});

test('[WEBCHAT-ROOM-07] 조회 오류면 한글 오류 + [다시 시도] — 입력/토큰 안 지움', async () => {
  const onRetryLoad = vi.fn();
  render(<ChatRoom phase="loadError" messages={[]} {...base} onRetryLoad={onRetryLoad} />);
  expect(screen.getByText('대화를 불러오지 못했어요.')).toBeInTheDocument(); // 개발자 오류문 금지
  await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(onRetryLoad).toHaveBeenCalledTimes(1);
  expect(screen.getByPlaceholderText('메시지를 입력하세요')).toBeInTheDocument(); // 첫 상담으로 안 바뀜
});

test('[WEBCHAT-ROOM-08] 전송하면 환자 말풍선을 전송 중으로 표시하고 같은 메시지 중복 전송을 막는다', async () => {
  const onSend = vi.fn();
  const sending: ThreadMessage[] = [{ id: 'local-1', senderType: 'patient', messageType: 'text',
    content: '주차 되나요?', sendState: 'sending', clientMessageId: 'c1' }];
  render(<ChatRoom phase="ready" messages={sending} {...base} onSend={onSend} />);
  const bubble = screen.getByText('주차 되나요?').closest('[data-send-state]');
  expect(bubble).toHaveAttribute('data-send-state', 'sending'); // 성공 말풍선처럼 위장 금지
  const input = screen.getByPlaceholderText('메시지를 입력하세요');
  await userEvent.type(input, '주차 되나요?{enter}');
  // 전송 중인 동일 메시지 재전송을 막는다(멱등 clientMessageId는 훅이 부여)
  expect(onSend).toHaveBeenCalledTimes(1);
});

test('[WEBCHAT-ROOM-09] 전송 실패면 성공처럼 표시 안 하고 [재전송]을 실패 말풍선 가까이 둔다', async () => {
  const onResend = vi.fn();
  const failed: ThreadMessage[] = [{ id: 'local-2', senderType: 'patient', messageType: 'text',
    content: '예약 되나요?', sendState: 'failed', clientMessageId: 'c2' }];
  render(<ChatRoom phase="ready" messages={failed} {...base} onResend={onResend} />);
  const bubble = screen.getByText('예약 되나요?').closest('[data-send-state]');
  expect(bubble).toHaveAttribute('data-send-state', 'failed');
  await userEvent.click(screen.getByRole('button', { name: '재전송' }));
  expect(onResend).toHaveBeenCalledWith('c2'); // 동일 메시지 재전송(다른 대화 안 만듦)
});

test('[WEBCHAT-ROOM-10] 인증 모달 왕복 뒤 메시지·전송 완료가 유지된다(비번은 기록에 안 섞음)', () => {
  const msgs: ThreadMessage[] = [
    { id: 'm1', senderType: 'patient', messageType: 'text', content: '내 예약 보여줘', sendState: 'sent' },
  ];
  // 모달을 닫고 돌아온 상태를 같은 messages로 다시 렌더 → 문맥 유지
  const { rerender } = render(<ChatRoom phase="ready" messages={msgs} {...base} />);
  rerender(<ChatRoom phase="ready" messages={msgs} {...base} />);
  expect(screen.getByText('내 예약 보여줘')).toBeInTheDocument();
  expect(screen.queryByText(/비밀번호/)).not.toBeInTheDocument(); // 인증 입력은 상담 기록에 없음
});
