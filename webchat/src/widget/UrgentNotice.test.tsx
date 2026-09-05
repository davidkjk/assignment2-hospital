import { render, screen } from '@testing-library/react';
import { UrgentNotice } from './UrgentNotice';

test('[WEBCHAT-URGENT-01] 긴급 표현 감지면 일반 예약 대화를 멈추고 119/응급실 이용을 안내', () => {
  render(<UrgentNotice bookingCtaVisible={false} contactRequested={false} />);
  // 정본(목업 102) 안내 문구 — 119·응급실 이용을 우선 안내한다.
  expect(screen.getByText('지금 심한 흉통이나 호흡곤란이 있다면 119에 연락하거나 가까운 응급실을 이용해 주세요.')).toBeInTheDocument();
});

test('[WEBCHAT-URGENT-02] 긴급 여부를 완벽히 보장하거나 진단한 것처럼 표현하지 않는다(필수 면책 문구 표시)', () => {
  render(<UrgentNotice bookingCtaVisible={false} contactRequested={false} />);
  // 정본(목업 102) 필수 면책 문구를 글자 그대로 표시한다.
  expect(screen.getByText('이 안내는 긴급 여부를 완벽히 판단하거나 진단하는 것이 아닙니다.')).toBeInTheDocument();
  // 긴급을 확정·보장하거나 진단한 것처럼 말하지 않는다("아닙니다"를 뒤집는 표현만 금지).
  expect(screen.queryByText(/확실히|반드시 응급|진단합니다|진단해 드립니다|진단 결과/)).not.toBeInTheDocument();
});

test('[WEBCHAT-URGENT-03] 긴급 안내 중 시간선택·예약확인 등 일반 예약 CTA를 함께 노출하지 않는다', () => {
  render(<UrgentNotice bookingCtaVisible={false} contactRequested={false} />);
  expect(screen.queryByRole('button', { name: /시간 선택|예약 신청/ })).not.toBeInTheDocument();
});

test('[WEBCHAT-URGENT-04] 익명 웹에서 인증·연락처를 긴급 안내보다 먼저 요구하지 않는다', () => {
  render(<UrgentNotice bookingCtaVisible={false} contactRequested={false} />);
  expect(screen.queryByPlaceholderText(/전화번호|연락처/)).not.toBeInTheDocument(); // 인계 폼은 직원 문의 선택 후(Task 15)
});
