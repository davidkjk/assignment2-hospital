import 'package:flutter_test/flutter_test.dart';

import 'notification_test_support.dart';

void main() {
  testWidgets('[NOTI-GO-01][NAV-HOME-16] 알림을 누르면 종류별 목적지로 간다', (t) async {
    await t.pumpWidget(inboxApp(
        FakeNotificationApi(items: [notiJson('confirmed', appt: 'ap1')], destinationExists: true)));
    await t.pumpAndSettle();
    await t.tap(find.text('예약 확정'));
    await t.pumpAndSettle();
    expect(find.text('예약 상세'), findsOneWidget); // /appointments/ap1
  });

  testWidgets('[NOTI-GONE-01][NOTI-GONE-02][NAV-HOME-17] 갈 곳이 없으면 팝업만·이동 안 함·알림은 남는다', (t) async {
    await t.pumpWidget(inboxApp(
        FakeNotificationApi(items: [notiJson('confirmed', appt: 'ap1')], destinationExists: false)));
    await t.pumpAndSettle();
    await t.tap(find.text('예약 확정'));
    await t.pumpAndSettle();
    expect(find.textContaining('더 이상 볼 수 없습니다'), findsOneWidget); // 안내 팝업(GONE-01)
    expect(find.text('예약 상세'), findsNothing); // 이동하지 않음
    expect(find.text('예약 확정'), findsOneWidget); // 알림은 목록에 그대로(GONE-02)
  });

  testWidgets('[NOTI-GONE-04] 팝업 문구는 사유를 단정하지 않고 두 가능성을 함께 적는다', (t) async {
    await t.pumpWidget(inboxApp(
        FakeNotificationApi(items: [notiJson('confirmed', appt: 'ap1')], destinationExists: false)));
    await t.pumpAndSettle();
    await t.tap(find.text('예약 확정'));
    await t.pumpAndSettle();
    expect(find.textContaining('예약이 취소되었거나 가족 연결이 해제되었을 수 있습니다'), findsOneWidget);
  });

  testWidgets('[NOTI-GONE-03] 목적지 확인은 누른 그 순간에만 한다(목록 그릴 때 전수 확인 안 함)', (t) async {
    final api = FakeNotificationApi(
        items: List.generate(5, (i) => notiJson('confirmed', appt: 'ap$i')),
        destinationExists: true);
    await t.pumpWidget(inboxApp(api));
    await t.pumpAndSettle();
    expect(api.existChecks, 0); // 목록 5줄을 그렸어도 존재 확인 0회
    await t.tap(find.text('예약 확정').first);
    await t.pumpAndSettle();
    expect(api.existChecks, 1); // 누른 한 줄만 확인
  });
}
