export function UrgentNotice({ bookingCtaVisible, contactRequested }:
  { bookingCtaVisible: boolean; contactRequested: boolean }) {
  void bookingCtaVisible; // false: 긴급 중 일반 예약 CTA 금지(URGENT-03)
  void contactRequested;  // false: 연락처 수집은 직원 문의 선택 후에만(URGENT-04)
  return (
    <div role="alert">
      <p>증상이 급하면 119 또는 가까운 응급실을 바로 이용해 주세요.</p>
    </div>
  );
}
