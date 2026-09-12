// 라우팅 결선(go_router)만 검증. 화면 알맹이는 row_detail·deeplink test가 본다.
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/router.dart' show isSensitiveLocation;
import 'package:hospital_patient_app/features/notifications/notification_view.dart';

NotificationView _n(String type) => NotificationView(
      id: 'n1', notificationType: type, kind: 'transactional', body: '본문',
      appointmentId: 'ap1', sentAt: DateTime(2026, 6, 1), isRead: false);

void main() {
  test('[NAV-HIST-05][NAV-HIST-06] 알림 병원취소·진료후안내는 /history?appointment= 로 간다(T18 계약 재확인)', () {
    // resolveNotificationRoute(T18)가 이미 이 라우트를 돌려준다 — 이력이 그 목적지를 실제로 받는지 확인.
    expect(resolveNotificationRoute(_n('hospital_cancelled')), '/history?appointment=ap1'); // NAV-HIST-05
    expect(resolveNotificationRoute(_n('visit_completed')), '/history?appointment=ap1'); // NAV-HIST-06
  });
  test('[NAV-HIST-01][NAV-HIST-02] 이력 탭 라우트는 민감 경로가 아니다 — 재인증 없이 연다', () {
    expect(isSensitiveLocation('/history'), false); // 가족(/family)·설정(/settings)과 다르다
    expect(isSensitiveLocation('/history?appointment=ap1'), false);
  });
  // 📌 NAV-HIST-03(홈 완료 카드 [방문 이력 보기]→/history)·NAV-HIST-04(홈 빈 상태 「지난 방문 이력 보기」→/history)는
  //    T16 홈 화면 소유의 리터럴(appointment_card.dart·home_screen.dart, grep 확인)이라 T16 test가 실현 — 여기서 중복하지 않는다.
}
