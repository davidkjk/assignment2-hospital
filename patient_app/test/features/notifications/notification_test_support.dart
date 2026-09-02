import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/core/connectivity.dart';
import 'package:hospital_patient_app/features/notifications/notification_data.dart';
import 'package:hospital_patient_app/features/notifications/notification_inbox.dart';
import 'package:hospital_patient_app/features/notifications/notification_view.dart';

/// 알림함 화면 테스트용 가짜 API — 목록/개수/읽음/목적지 존재를 주입하고 호출을 센다.
class FakeNotificationApi implements NotificationApi {
  FakeNotificationApi({this.items = const [], this.unread = 0, this.destinationExists = true});
  final List<Map<String, dynamic>> items;
  final int unread;
  final bool destinationExists;
  bool markedRead = false;
  int existChecks = 0;

  @override
  Future<List<NotificationView>> list() async => items.map(NotificationView.fromJson).toList();
  @override
  Future<int> unreadCount() async => unread;
  @override
  Future<void> markRead() async => markedRead = true;
  @override
  Future<bool> appointmentExists(String id) async {
    existChecks++;
    return destinationExists;
  }
}

/// notification_log 한 줄 모양의 JSON(서버 응답 대역).
Map<String, dynamic> notiJson(String type,
        {String? appt = 'ap1', String body = '예약 안내', bool read = false}) =>
    {
      'id': 'n-$type-$appt',
      'notification_type': type,
      'kind': 'transactional',
      'body': body,
      'appointment_id': appt,
      'is_read': read,
      'sent_at': '2026-08-18T09:00:00Z',
    };

NotificationView noti(String type,
        {String? appt = 'ap1', String body = '예약 안내', bool read = false}) =>
    NotificationView.fromJson(notiJson(type, appt: appt, body: body, read: read));

/// 고정 목록으로 화면만 렌더(진입 시 읽음 창구는 no-op stub API로 막는다).
Widget inboxWith(List<NotificationView> items, {bool online = true}) => ProviderScope(
      overrides: [
        notificationsProvider.overrideWith((ref) async => items),
        connectivityProvider.overrideWith((ref) => Stream.value(online)),
        notificationApiProvider.overrideWithValue(FakeNotificationApi()),
      ],
      child: MaterialApp(home: NotificationInbox(now: DateTime(2026, 8, 18, 15))),
    );

/// 오프라인 화면.
Widget inboxOffline() => inboxWith(const [], online: false);

/// 실제 provider 체인 + FakeApi + 라우터(목적지 이동·읽음 호출 검증용).
Widget inboxApp(FakeNotificationApi api) => ProviderScope(
      overrides: [
        notificationApiProvider.overrideWithValue(api),
        connectivityProvider.overrideWith((ref) => Stream.value(true)),
      ],
      child: MaterialApp.router(
        routerConfig: GoRouter(
          initialLocation: '/notifications',
          routes: [
            GoRoute(path: '/notifications', builder: (c, s) => NotificationInbox(now: DateTime(2026, 8, 18, 15))),
            GoRoute(
                path: '/appointments/:id',
                builder: (c, s) => const Scaffold(body: Center(child: Text('예약 상세')))),
            GoRoute(
                path: '/history',
                builder: (c, s) => const Scaffold(body: Center(child: Text('방문 이력')))),
            GoRoute(
                path: '/questionnaire/:id',
                builder: (c, s) => const Scaffold(body: Center(child: Text('사전문진')))),
            GoRoute(path: '/chat', builder: (c, s) => const Scaffold(body: Center(child: Text('상담방')))),
          ],
        ),
      ),
    );

// ── 색·구조 추출 헬퍼(NotificationRow 계약: 왼쪽 색 바 Container에 key('noti-bar')) ──

Finder _rowOf(String title) =>
    find.ancestor(of: find.text(title), matching: find.byType(NotificationRow));

Color? barColor(WidgetTester t, String title) {
  final bar = find.descendant(of: _rowOf(title), matching: find.byKey(const ValueKey('noti-bar')));
  final c = t.widget<Container>(bar);
  return (c.decoration as BoxDecoration?)?.color;
}

bool hasBar(WidgetTester t, String title) {
  final color = barColor(t, title);
  return color != null && color != Colors.transparent;
}

Color? textColor(WidgetTester t, String title) {
  final text = t.widget<Text>(find.descendant(of: _rowOf(title), matching: find.text(title)));
  return text.style?.color;
}

bool rowBackgroundTinted(WidgetTester t, String title) {
  // 줄 전체 배경(NotificationRow 루트 Container)이 물들었는지 — 색 바(4px) 말고 넓은 면.
  final rowBg = find.descendant(
      of: _rowOf(title), matching: find.byKey(const ValueKey('noti-row-bg')));
  if (rowBg.evaluate().isEmpty) return false;
  final c = t.widget<Container>(rowBg.first);
  final color = (c.decoration as BoxDecoration?)?.color ?? c.color;
  return color != null && color != Colors.transparent && color != Colors.white;
}
