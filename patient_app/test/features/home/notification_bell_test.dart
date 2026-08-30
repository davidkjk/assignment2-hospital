import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/home/notification_bell.dart';

Widget _wrap(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  testWidgets('[HOME-BAR-02] 안 읽은 알림이 있으면 개수 배지', (t) async {
    await t.pumpWidget(_wrap(const NotificationBell(unreadCount: 3)));
    expect(find.text('3'), findsOneWidget);
  });

  testWidgets('[HOME-BAR-02] 안 읽은 알림이 0이면 배지가 사라진다(숫자 0을 그리지 않는다)', (t) async {
    await t.pumpWidget(_wrap(const NotificationBell(unreadCount: 0)));
    expect(find.text('0'), findsNothing);
  });

  testWidgets('[HOME-BAR-01] 종을 누르면 onTap이 불린다', (t) async {
    var tapped = false;
    await t.pumpWidget(_wrap(NotificationBell(unreadCount: 0, onTap: () => tapped = true)));
    await t.tap(find.byType(NotificationBell));
    expect(tapped, isTrue);
  });
}
