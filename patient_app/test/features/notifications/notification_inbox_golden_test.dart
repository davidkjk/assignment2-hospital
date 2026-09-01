import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import '../../support/golden_fonts.dart';
import 'package:hospital_patient_app/core/connectivity.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/notifications/notification_data.dart';
import 'package:hospital_patient_app/features/notifications/notification_inbox.dart';
import 'package:hospital_patient_app/features/notifications/notification_view.dart';

import 'notification_test_support.dart';

// Task 18 골든 게이트 — 알림함 목록을 데모 Notifications와 눈대조한다.
// 색 바 3종(딥틸/주의/없음)·읽음 대비·날짜 묶음 3개를 한 화면에 담는다.
// 한글(AppleGothic) + 아이콘(MaterialIcons)을 로드해 tofu 없이 렌더한다.

void main() {
  setUpAll(() async {
    await loadGoldenFonts();
    final gothic = File('/System/Library/Fonts/Supplemental/AppleGothic.ttf');
    if (gothic.existsSync()) {
      await (FontLoader('Roboto')
            ..addFont(Future.value(gothic.readAsBytesSync().buffer.asByteData())))
          .load();
    }
    final icons = File(
        '/Users/kimjunkee/dev/flutter/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf');
    if (icons.existsSync()) {
      await (FontLoader('MaterialIcons')
            ..addFont(Future.value(icons.readAsBytesSync().buffer.asByteData())))
          .load();
    }
  });

  NotificationView n(String type, String date,
          {required bool read, required String body}) =>
      NotificationView.fromJson({
        'id': '$type-$date',
        'notification_type': type,
        'kind': 'transactional',
        'body': body,
        'appointment_id': 'ap1',
        'is_read': read,
        'sent_at': '${date}T09:00:00Z',
      });

  testWidgets('notification inbox golden (데모 대조용)', (t) async {
    final now = DateTime(2026, 8, 18, 15);
    final items = [
      n('confirmed', '2026-08-18', read: false, body: '김순자님 예약이 확정되었습니다'),
      n('changed', '2026-08-18', read: false, body: '병원 사정으로 예약 시간이 변경되었습니다'),
      n('questionnaire_missing', '2026-08-18', read: true, body: '진료 전 사전문진을 작성할 수 있습니다'),
      n('reminder_day_before', '2026-08-17', read: true, body: '내일 예약 하루 전 안내입니다'),
      n('support_answered', '2026-08-17', read: false, body: '상담방에 새로운 답변이 있습니다'),
      n('hospital_cancelled', '2026-08-16', read: true, body: '병원 사정으로 예약이 취소되었습니다'),
    ];
    await t.binding.setSurfaceSize(const Size(390, 1000));
    addTearDown(() => t.binding.setSurfaceSize(null));
    await t.pumpWidget(ProviderScope(
      overrides: [
        notificationsProvider.overrideWith((ref) async => items),
        connectivityProvider.overrideWith((ref) => Stream.value(true)),
        notificationApiProvider.overrideWithValue(FakeNotificationApi()),
      ],
      child: MaterialApp(theme: AppTheme.theme, home: NotificationInbox(now: now)),
    ));
    await t.pumpAndSettle();
    await expectLater(find.byType(NotificationInbox), matchesGoldenFile('goldens/notification_inbox.png'));
  });
}
