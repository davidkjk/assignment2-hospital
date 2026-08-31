import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/connectivity.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/settings/notification_prefs_repository.dart';
import 'package:hospital_patient_app/features/settings/notification_settings_screen.dart';

import 'harness.dart';

// ── 컨트롤러 단위(SET-NOTI-12·13·14) ──
void main() {
  test('[SET-NOTI-12] 스위치를 켜면 그 자리에서 PATCH를 보낸다(저장 버튼 없음)', () async {
    final api = FakeNotificationPrefsRepo({'appt_status': true});
    final c = NotificationSettingsController(api);
    await c.load();
    await c.toggle('appt_status', false);
    expect(api.lastPatch, {'group': 'appt_status', 'enabled': false});
    expect(c.state.prefs['appt_status'], false);
  });

  test('[SET-NOTI-13] 저장 실패면 스위치를 원래 자리로 되돌리고 그 줄에 오류를 단다', () async {
    final api = FakeNotificationPrefsRepo({'appt_status': true})..failNextPatch = true;
    final c = NotificationSettingsController(api);
    await c.load();
    await c.toggle('appt_status', false);
    expect(c.state.prefs['appt_status'], true); // ⭐ 되돌림
    expect(c.state.errorFor['appt_status'], isNotNull);
  });

  test('[SET-NOTI-14] 저장 중에는 그 토글만 잠긴다(화면 전체가 아니라)', () async {
    final api = FakeNotificationPrefsRepo({'appt_status': true})..hold();
    final c = NotificationSettingsController(api);
    await c.load();
    final f = c.toggle('appt_status', false);
    expect(c.state.busy.contains('appt_status'), true);
    expect(c.state.busy.contains('appt_change'), false);
    api.release();
    await f;
    expect(c.state.busy.contains('appt_status'), false);
  });

  // ── 화면 위젯 ──
  Future<ProviderContainer> pumpScreen(WidgetTester t, FakeNotificationPrefsRepo api,
      {bool offline = false}) async {
    final container = ProviderContainer(overrides: [
      notificationPrefsRepositoryProvider.overrideWithValue(api),
      if (offline) connectivityProvider.overrideWith((ref) => Stream.value(false)),
    ]);
    addTearDown(container.dispose);
    await t.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp(theme: AppTheme.theme, home: const NotificationSettingsScreen()),
    ));
    return container;
  }

  testWidgets('[SET-NOTI-04] 2묶음 6토글 — 문자·받는 방법 묶음은 없다', (t) async {
    await pumpScreen(t, FakeNotificationPrefsRepo(allOn));
    await t.pumpAndSettle();
    expect(find.text('예약에 관한 알림'), findsOneWidget);
    expect(find.text('그 밖의 알림'), findsOneWidget);
    expect(find.byType(SwitchListTile), findsNWidgets(6));
    expect(find.textContaining('문자로도 받기'), findsNothing);
    expect(find.textContaining('받는 방법'), findsNothing);
  });

  testWidgets('[SET-NOTI-05] 중요 알림(변경·취소)만 왼쪽 4px 붉은 띠', (t) async {
    await pumpScreen(t, FakeNotificationPrefsRepo(allOn));
    await t.pumpAndSettle();
    final box = t.widget<Container>(find.byKey(const Key('noti-appt_change')));
    expect(((box.decoration as BoxDecoration).border! as Border).left.width, 4);
  });

  testWidgets('[SET-NOTI-07~09] 중요 알림을 끄면 안내 팝업 뒤 꺼진다(막지 않음)', (t) async {
    final c = await pumpScreen(t, FakeNotificationPrefsRepo(allOn));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('switch-appt_change')));
    await t.pumpAndSettle();
    expect(find.textContaining('예약 시간이 바뀌거나 취소될 때'), findsOneWidget);
    expect(find.text('그대로 둘게요'), findsOneWidget);
    expect(find.text('끄기'), findsOneWidget);
    await t.tap(find.text('끄기'));
    await t.pumpAndSettle();
    expect(c.read(notificationSettingsControllerProvider).prefs['appt_change'], false);
  });

  testWidgets('[SET-NOTI-10] 안내 팝업은 한 번만 — 두 번째 끄기부터는 안 뜬다', (t) async {
    final c = await pumpScreen(t, FakeNotificationPrefsRepo(allOn));
    await t.pumpAndSettle();
    // 껐다(팝업·끄기) 다시 켬
    await t.tap(find.byKey(const Key('switch-appt_change')));
    await t.pumpAndSettle();
    await t.tap(find.text('끄기'));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('switch-appt_change'))); // 다시 켬(팝업 없음)
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('switch-appt_change'))); // 두 번째 끄기
    await t.pumpAndSettle();
    expect(find.text('끄기'), findsNothing);
    expect(c.read(notificationSettingsControllerProvider).prefs['appt_change'], false);
  });

  testWidgets('[SET-NOTI-11] 그 밖의 알림은 팝업 없이 그냥 꺼진다', (t) async {
    final c = await pumpScreen(t, FakeNotificationPrefsRepo(allOn));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('switch-visit_note')));
    await t.pumpAndSettle();
    expect(find.text('끄기'), findsNothing);
    expect(c.read(notificationSettingsControllerProvider).prefs['visit_note'], false);
  });

  testWidgets('[SET-NOTI-13] 저장 실패 시 그 줄 아래 오류 한 줄', (t) async {
    await pumpScreen(t, FakeNotificationPrefsRepo(allOn)..failNextPatch = true);
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('switch-appt_status')));
    await t.pumpAndSettle();
    expect(find.textContaining('저장하지 못했습니다'), findsOneWidget);
  });

  testWidgets('[SET-HOME-16] 오프라인이면 스위치가 비활성 + 이유', (t) async {
    await pumpScreen(t, FakeNotificationPrefsRepo(allOn), offline: true);
    await t.pumpAndSettle();
    expect(find.textContaining('인터넷에 연결되면'), findsWidgets);
    final sw = t.widget<SwitchListTile>(find.byKey(const Key('switch-appt_status')));
    expect(sw.onChanged, isNull);
  });
}
