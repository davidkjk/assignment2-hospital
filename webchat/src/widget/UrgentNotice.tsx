export function UrgentNotice({ bookingCtaVisible, contactRequested }:
  { bookingCtaVisible: boolean; contactRequested: boolean }) {
  void bookingCtaVisible; // false: 긴급 중 일반 예약 CTA 금지(URGENT-03)
  void contactRequested;  // false: 연락처 수집은 직원 문의 선택 후에만(URGENT-04)
  return (
    <div className="wc-urgent" role="alert">
      <svg className="wc-urgent__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5M12 17h.01" />
      </svg>
      <p>증상이 급하면 119 또는 가까운 응급실을 바로 이용해 주세요.</p>
    </div>
  );
}
