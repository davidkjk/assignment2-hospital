import { render, screen } from '@testing-library/react';
import { UrgentNotice } from './UrgentNotice';

test('[WEBCHAT-URGENT-01] 긴급 표현 감지면 일반 예약 대화를 멈추고 119/응급실 이용을 안내', () => {
  render(<UrgentNotice bookingCtaVisible={false} contactRequested={false} />);
  expect(screen.getByText(/119|응급실/)).toBeInTheDocument();
});

test('[WEBCHAT-URGENT-02] 긴급 여부를 완벽히 보장하거나 진단한 것처럼 표현하지 않는다', () => {
  render(<UrgentNotice bookingCtaVisible={false} contactRequested={false} />);
  expect(screen.queryByText(/진단|확실히|반드시 응급/)).not.toBeInTheDocument();
});

test('[WEBCHAT-URGENT-03] 긴급 안내 중 시간선택·예약확인 등 일반 예약 CTA를 함께 노출하지 않는다', () => {
  render(<UrgentNotice bookingCtaVisible={false} contactRequested={false} />);
  expect(screen.queryByRole('button', { name: /시간 선택|예약 신청/ })).not.toBeInTheDocument();
});

test('[WEBCHAT-URGENT-04] 익명 웹에서 인증·연락처를 긴급 안내보다 먼저 요구하지 않는다', () => {
  render(<UrgentNotice bookingCtaVisible={false} contactRequested={false} />);
  expect(screen.queryByPlaceholderText(/전화번호|연락처/)).not.toBeInTheDocument(); // 인계 폼은 직원 문의 선택 후(Task 15)
});
