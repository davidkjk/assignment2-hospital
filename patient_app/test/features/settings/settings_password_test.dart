import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/settings/settings_password_screen.dart';

import 'harness.dart';

void main() {
  // ── 컨트롤러(SET-PW-13·14·15·16) ──
  test('[SET-PW-13·14·15] 성공하면 다른 기기 세션을 끊고 done', () async {
    final auth = FakeSettingsAuthGateway();
    final c = SettingsPasswordController(auth);
    await c.submit('newpass12', 'newpass12');
    expect(auth.updatedPassword, 'newpass12');
    expect(auth.otherSessionsRevoked, true); // ⭐ #73 다른 기기만
    expect(c.state.done, true);
  });

  test('[SET-PW-16] 서버가 거절하면 붙박이 오류', () async {
    final auth = FakeSettingsAuthGateway()..failUpdate = true;
    final c = SettingsPasswordController(auth);
    await c.submit('newpass12', 'newpass12');
    expect(c.state.error, isNotNull);
    expect(c.state.done, false);
  });

  // ── 화면(SET-PW-02·03) ──
  testWidgets('[SET-PW-02·03] 현재 비밀번호를 묻지 않고 그 이유를 밝힌다', (t) async {
    await t.pumpWidget(ProviderScope(
      overrides: [settingsAuthGatewayProvider.overrideWithValue(FakeSettingsAuthGateway())],
      child: MaterialApp(theme: AppTheme.theme, home: SettingsPasswordScreen(onDone: () {})),
    ));
    await t.pumpAndSettle();
    expect(find.textContaining('본인 확인을 마쳤으니'), findsOneWidget); // SET-PW-03
    expect(find.textContaining('현재 비밀번호'), findsNothing);         // SET-PW-02
  });

  testWidgets('[SET-PW-13] 새 비밀번호 두 칸을 채워 바꾸면 onDone이 불린다', (t) async {
    var done = false;
    final auth = FakeSettingsAuthGateway();
    await t.pumpWidget(ProviderScope(
      overrides: [settingsAuthGatewayProvider.overrideWithValue(auth)],
      child: MaterialApp(theme: AppTheme.theme, home: SettingsPasswordScreen(onDone: () => done = true)),
    ));
    await t.pumpAndSettle();
    await t.enterText(find.byKey(const Key('newpw')), 'newpass12');
    await t.enterText(find.byKey(const Key('newpw-confirm')), 'newpass12');
    await t.pumpAndSettle();
    await t.tap(find.text('비밀번호 바꾸기'));
    await t.pumpAndSettle();
    expect(auth.updatedPassword, 'newpass12');
    expect(done, true);
  });
}
