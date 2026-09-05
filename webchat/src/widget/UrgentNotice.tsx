export function UrgentNotice({ bookingCtaVisible, contactRequested }:
  { bookingCtaVisible: boolean; contactRequested: boolean }) {
  void bookingCtaVisible; // false: 긴급 중 일반 예약 CTA 금지(URGENT-03)
  void contactRequested;  // false: 연락처 수집은 직원 문의 선택 후에만(URGENT-04)
  return (
    <div className="wc-urgent" role="alert">
      <svg className="wc-urgent__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5M12 17h.01" />
      </svg>
      {/* 목업 102(WEBCHAT-URGENT) 정본 — 안내 + 필수 면책 문구를 글자 그대로. */}
      <div className="wc-urgent__body">
        <p className="wc-urgent__lead">지금 심한 흉통이나 호흡곤란이 있다면 119에 연락하거나 가까운 응급실을 이용해 주세요.</p>
        <p className="wc-urgent__disc">이 안내는 긴급 여부를 완벽히 판단하거나 진단하는 것이 아닙니다.</p>
      </div>
    </div>
  );
}
