import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OutageNotice } from './OutageNotice';
const base = { hospitalPhone: '02-000-0000', onLeaveInquiry: () => {}, onRetry: () => {} };

test('[WEBCHAT-OUTAGE-01] 한글 장애 안내 — 예약·진료기록까지 장애라고 확대하지 않는다', () => {
  render(<OutageNotice phase="idle" {...base} />);
  // 정본(목업 101) 제목·본문 — AI 답변만 일시 중단이며 병원 운영·예약·진료기록은 유지.
  expect(screen.getByText('지금은 AI 답변을 드리기 어렵습니다')).toBeInTheDocument();
  expect(screen.getByText(/AI 상담 기능만 일시적으로 사용할 수 없습니다/)).toBeInTheDocument();
  expect(screen.queryByText(/예약.*(불가|장애)|진료기록.*(불가|장애)/)).not.toBeInTheDocument();
});

test('[WEBCHAT-OUTAGE-02] [문의 남기기]를 누르면 기존 문맥으로 직원 문의를 시작한다(익명은 인계 폼=Task 15)', async () => {
  const onLeaveInquiry = vi.fn();
  render(<OutageNotice phase="idle" {...base} onLeaveInquiry={onLeaveInquiry} />);
  await userEvent.click(screen.getByRole('button', { name: '문의 남기기' }));
  expect(onLeaveInquiry).toHaveBeenCalledTimes(1); // 봇 응답 없이 대화 문맥으로 인계
});

test('[WEBCHAT-OUTAGE-03] 제출 중이면 원래 동작을 잠그고 완료로 가장하지 않는다(중복 티켓 방지)', () => {
  render(<OutageNotice phase="submitting" {...base} />);
  // 정본(목업 101) 진행 라벨 "문의 남기는 중" + 잠금
  expect(screen.getByRole('button', { name: '문의 남기는 중' })).toBeDisabled();
  expect(screen.queryByText(/연결됐습니다/)).not.toBeInTheDocument(); // 아직 완료 아님
});

test('[WEBCHAT-OUTAGE-04] 제출 실패면 한글 오류 + 재시도, 기존 대화/입력값 보존', async () => {
  const onRetry = vi.fn();
  render(<OutageNotice phase="error" {...base} onRetry={onRetry} />);
  // 정본(목업 101) 실패 문구 + 대화 보존 안내
  expect(screen.getByText('문의를 남기지 못했습니다')).toBeInTheDocument();
  expect(screen.getByText('대화 내용은 그대로 있습니다.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test('[WEBCHAT-OUTAGE-05] 제출 완료면 `상담(직원 확인)으로 연결됐습니다`만 — 접수/등록·AI 복구 암시 금지', () => {
  render(<OutageNotice phase="done" {...base} />);
  expect(screen.getByText('상담(직원 확인)으로 연결됐습니다')).toBeInTheDocument();
  expect(screen.queryByText(/접수|등록|복구|정상화/)).not.toBeInTheDocument();
});

test('[WEBCHAT-OUTAGE-06] 비상 CTA는 병원 전화번호 + [문의 남기기]가 주 경로 — 앱 예약은 보조 문구만', () => {
  render(<OutageNotice phase="idle" {...base} />);
  expect(screen.getByText('02-000-0000')).toBeInTheDocument();
  expect(screen.getByText('병원에 바로 전화하기')).toBeInTheDocument(); // 전화가 주 경로임을 캡션으로(목업 101)
  expect(screen.getByRole('button', { name: '문의 남기기' })).toBeInTheDocument();
  const appNote = screen.getByText(/병원 앱의 예약 메뉴/); // 정본: 앱 예약은 보조 문장으로만
  expect(appNote.closest('[data-role="secondary"]')).not.toBeNull(); // 앱 예약은 주 CTA가 아니다
});
