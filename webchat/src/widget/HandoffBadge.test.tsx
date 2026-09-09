import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HandoffBadge } from './HandoffBadge';
import type { HandoffStatus } from '../api/webchatApi';
const pump = (s: HandoffStatus, onRetry = () => {}) => render(<HandoffBadge status={s} onRetry={onRetry} />);

test('[WEBCHAT-HANDOFF-01/Q18④] 인계 뒤 상태별 라벨 — 확인 전/확인 중(presence)/답변 도착', () => {
  pump({ phase: 'connecting', isOpen: true });
  expect(screen.getByText('직원 확인 전이에요')).toBeInTheDocument();       // 배정돼도 환자에겐 '확인 전'(Q18②)
  pump({ phase: 'inProgress', isOpen: true, assigneeName: '김간호', assigneeRole: '간호사' });
  expect(screen.getByText('직원이 확인 중이에요')).toBeInTheDocument();     // 실제 열람 presence(별도 realtime)
  pump({ phase: 'answered', isOpen: true, assigneeName: '이의사', assigneeRole: '의사' });
  expect(screen.getByText('이의사 의사')).toBeInTheDocument();             // 답변 도착 = 직원 이름·역할
});

test('[CHAT-HANDOFF-STATE-03] 직원이 상담 종료(closed)하면 `상담 종료` — 답변 도착과 구분', () => {
  // 같은 answered라도 closed=true면 '상담 종료'다(직원이 [상담 종료] 실행). 단순 답장(closed=false)은 '답변 도착'.
  pump({ phase: 'answered', isOpen: true, assigneeName: '이의사', assigneeRole: '의사', closed: true });
  expect(screen.getByText('상담 종료')).toBeInTheDocument();
  expect(screen.queryByText('답변 도착')).not.toBeInTheDocument();
  expect(screen.queryByText('이의사 의사')).not.toBeInTheDocument(); // 종료면 담당자 이름 더 안 붙임
});

test('[CHAT-HANDOFF-STATE-03] 답장만 왔을 뿐 종료가 아니면(closed=false) 그대로 `답변 도착`', () => {
  pump({ phase: 'answered', isOpen: true, assigneeName: '이의사', assigneeRole: '의사', closed: false });
  expect(screen.getByText('답변 도착')).toBeInTheDocument();
  expect(screen.queryByText('상담 종료')).not.toBeInTheDocument();
});

test('[Q18③] connecting에 열람 presence(staffViewing)가 겹치면 `직원이 확인 중이에요`로 바뀐다', () => {
  const { rerender } = render(<HandoffBadge status={{ phase: 'connecting', isOpen: true }} onRetry={() => {}} />);
  expect(screen.getByText('직원 확인 전이에요')).toBeInTheDocument(); // presence 없으면 확인 전
  rerender(<HandoffBadge status={{ phase: 'connecting', isOpen: true }} staffViewing onRetry={() => {}} />);
  expect(screen.getByText('직원이 확인 중이에요')).toBeInTheDocument(); // 직원이 실제 열람 중
  expect(screen.queryByText('직원 확인 전이에요')).not.toBeInTheDocument();
});

test('[WEBCHAT-HANDOFF-02] 운영시간 판정은 서버 is_open 결과를 쓴다 — 환경변수 9~18시 금지', () => {
  // isOpen은 서버가 준 값이며 위젯은 클라 시계로 재판정하지 않는다.
  pump({ phase: 'connecting', isOpen: false, hoursNote: '다음 영업일에 답변드립니다' });
  expect(screen.getByText('다음 영업일에 답변드립니다')).toBeInTheDocument();
});

test('[WEBCHAT-HANDOFF-03] 상담 중이어도 근거 없는 분 단위 예상시간을 만들지 않는다', () => {
  pump({ phase: 'inProgress', isOpen: true, assigneeName: '이의사', assigneeRole: '의사' });
  expect(screen.getByText('직원이 확인 중이에요')).toBeInTheDocument();
  expect(screen.queryByText(/분 후|분 뒤|예상/)).not.toBeInTheDocument(); // 서버가 안 준 예상시간 금지
});

test('[WEBCHAT-HANDOFF-04] 운영시간 밖이면 다음 영업일 답변 안내(같은 판정에서 얻은 문구)', () => {
  pump({ phase: 'connecting', isOpen: false, hoursNote: '다음 영업일에 순서대로 답변드립니다' });
  expect(screen.getByText('다음 영업일에 순서대로 답변드립니다')).toBeInTheDocument();
});

test('[WEBCHAT-HANDOFF-05] 상태 조회 중이면 이전 배지를 임의로 바꾸지 않고 조회 중을 표시', () => {
  pump({ phase: null, isOpen: true }); // 조회 전
  expect(screen.getByRole('status')).toHaveTextContent('상태 확인 중');
  expect(screen.queryByText('답변완료')).not.toBeInTheDocument();
});

test('[WEBCHAT-HANDOFF-06] 상태 조회 오류면 답변완료로 가장하지 않고 한글 오류 + 재조회', async () => {
  const onRetry = vi.fn();
  pump({ phase: null, isOpen: true, loadError: true }, onRetry);
  expect(screen.getByText('상태를 불러오지 못했어요.')).toBeInTheDocument();
  expect(screen.queryByText('답변완료')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test('[WEBCHAT-HANDOFF-07/Q18] 환자 노출 문구는 `상담(직원 확인)으로 연결됐어요`만 — 취소 접수/등록·시간 약속 금지', () => {
  pump({ phase: 'connecting', isOpen: true });
  expect(screen.getByText(/상담\(직원 확인\)으로 연결됐어요\. 순서대로 확인해 답변드려요/)).toBeInTheDocument();
  expect(screen.queryByText(/취소 요청.*(접수|등록)|예약이 취소/)).not.toBeInTheDocument();
  expect(screen.queryByText(/\d+분|몇 시|까지 답변/)).not.toBeInTheDocument(); // 시간 약속 금지
});
