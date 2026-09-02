import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HandoffForm } from './HandoffForm';
import type { WebchatApi } from '../api/webchatApi';
import type { HandoffSummary } from './WebchatWidget';

const summary: HandoffSummary = { threadId: 't1', summary: ['방문 이유: 두통', '희망 진료과: 신경과'] };
function fakeApi(over: Partial<WebchatApi> = {}): WebchatApi {
  return {
    startOrRestoreSession: vi.fn(), fetchMessages: vi.fn(), sendMessage: vi.fn(), fetchHandoff: vi.fn(), acknowledgeBatches: vi.fn(),
    revalidateAction: vi.fn(), executeCard: vi.fn(), attributeSessionToAccount: vi.fn(),
    createHandoffTicket: vi.fn(async () => ({ ticketId: 'tk1' })),
    ...over,
  } as unknown as WebchatApi;
}

test('[WEBANON-HANDOFF-01] 폼은 기존 대화 요약과 연결하고 처음부터 다시 설명시키지 않는다', () => {
  render(<HandoffForm api={fakeApi()} summary={summary} onDone={() => {}} onCancel={() => {}} />);
  expect(screen.getByText(/상담 내용을 직원에게 함께 전달/)).toBeInTheDocument();
  expect(screen.queryByText(/처음부터 다시 입력/)).not.toBeInTheDocument();
});

test('[WEBANON-HANDOFF-02] 이름을 받되 별도 의료정보·주소·주민번호 칸을 두지 않는다', () => {
  render(<HandoffForm api={fakeApi()} summary={summary} onDone={() => {}} onCancel={() => {}} />);
  expect(screen.getByLabelText('이름')).toBeInTheDocument();
  expect(screen.queryByLabelText(/주소|주민등록|증상 상세/)).not.toBeInTheDocument();
});

test('[WEBANON-HANDOFF-03] 전화번호는 선택 입력이고 직원 답변 문자 수신용이라는 목적을 폼에 알린다', () => {
  render(<HandoffForm api={fakeApi()} summary={summary} onDone={() => {}} onCancel={() => {}} />);
  expect(screen.getByLabelText('전화번호')).toBeInTheDocument();
  expect(screen.getByText(/직원 답변 문자를 받기 위한 용도로만/)).toBeInTheDocument();
});

test('[WEBANON-HANDOFF-04] 이름 비었거나 연락처 형식 오류면 해당 칸 가까이 한글로 알리고 다른 값·문맥은 유지한다', async () => {
  render(<HandoffForm api={fakeApi()} summary={summary} onDone={() => {}} onCancel={() => {}} />);
  await userEvent.type(screen.getByLabelText('전화번호'), '123');
  await userEvent.click(screen.getByRole('button', { name: '상담 연결' }));
  expect(screen.getByText('이름을 입력해 주세요')).toBeInTheDocument();
  expect(screen.getByText('전화번호 형식을 확인해 주세요')).toBeInTheDocument();
  expect(screen.getByLabelText('전화번호')).toHaveValue('123'); // 입력 유지
});

test('[WEBANON-HANDOFF-05] 유효한 이름·연락처면 대화 요약을 연결해 티켓 생성을 요청한다', async () => {
  const api = fakeApi();
  render(<HandoffForm api={api} summary={summary} onDone={() => {}} onCancel={() => {}} />);
  await userEvent.type(screen.getByLabelText('이름'), '홍길동');
  await userEvent.type(screen.getByLabelText('전화번호'), '01012345678');
  await userEvent.click(screen.getByRole('button', { name: '상담 연결' }));
  await waitFor(() => expect(api.createHandoffTicket).toHaveBeenCalledWith(
    { threadId: 't1', name: '홍길동', phone: '01012345678', summary: summary.summary }));
});

test('[WEBANON-HANDOFF-06] 제출 중에는 중복 티켓 생성을 막고 완료로 가장하지 않는다', async () => {
  let resolve!: (v: { ticketId: string }) => void;
  const api = fakeApi({ createHandoffTicket: vi.fn(() => new Promise<{ ticketId: string }>((r) => { resolve = r; })) });
  render(<HandoffForm api={api} summary={summary} onDone={() => {}} onCancel={() => {}} />);
  await userEvent.type(screen.getByLabelText('이름'), '홍길동');
  await userEvent.click(screen.getByRole('button', { name: '상담 연결' }));
  await userEvent.click(screen.getByRole('button', { name: '상담 연결' }));
  expect(api.createHandoffTicket).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toBeInTheDocument(); // 아직 연결 완료로 표시 안 함
  resolve({ ticketId: 'tk1' });
});

test('[WEBANON-HANDOFF-07] 티켓 생성 실패는 성공처럼 표시하지 않고 입력을 보존한 채 재시도하게 하며 "접수/등록"을 쓰지 않는다', async () => {
  const api = fakeApi({ createHandoffTicket: vi.fn(async () => { throw new Error('fail'); }) });
  const onDone = vi.fn();
  render(<HandoffForm api={api} summary={summary} onDone={onDone} onCancel={() => {}} />);
  await userEvent.type(screen.getByLabelText('이름'), '홍길동');
  await userEvent.click(screen.getByRole('button', { name: '상담 연결' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('실패');
  expect(onDone).not.toHaveBeenCalled();
  expect(screen.getByLabelText('이름')).toHaveValue('홍길동'); // 입력 보존
  expect(screen.queryByText(/접수|등록/)).not.toBeInTheDocument();
});

test('[WEBANON-HANDOFF-08] 제출 완료면 방으로 돌아가도록 onDone을 부른다(연락처는 SMS 답변 수신용만)', async () => {
  const onDone = vi.fn();
  render(<HandoffForm api={fakeApi()} summary={summary} onDone={onDone} onCancel={() => {}} />);
  await userEvent.type(screen.getByLabelText('이름'), '홍길동');
  await userEvent.click(screen.getByRole('button', { name: '상담 연결' }));
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
});

test('[WEBANON-HANDOFF-09] 폼은 다른 기기 이어보기 경로를 제공하지 않는다(같은 브라우저 토큰만)', () => {
  render(<HandoffForm api={fakeApi()} summary={summary} onDone={() => {}} onCancel={() => {}} />);
  expect(screen.queryByRole('button', { name: /다른 기기.*이어보기/ })).not.toBeInTheDocument();
});
