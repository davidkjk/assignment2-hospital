import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/core/connectivity.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/auth/auth_repo.dart';
import 'package:hospital_patient_app/features/home/home_data.dart' show hospitalInfoProvider, HospitalInfo;
import 'package:hospital_patient_app/features/settings/logout_confirm.dart';
import 'package:hospital_patient_app/features/settings/settings_home_screen.dart';

import 'harness.dart';

const _me = MyProfile(name: '김순자', phone: '010-0000-5678');

Future<(FakeAuthRepoForLogout, FakePushService)> _pump(WidgetTester t,
    {bool offline = false, bool failUnregister = false}) async {
  await t.binding.setSurfaceSize(const Size(390, 950));
  addTearDown(() => t.binding.setSurfaceSize(null));
  final auth = FakeAuthRepoForLogout();
  final push = FakePushService()..failUnregister = failUnregister;
  final router = GoRouter(initialLocation: '/settings', routes: [
    GoRoute(path: '/settings', builder: (c, s) => const SettingsHomeScreen()),
    GoRoute(path: '/login', builder: (c, s) => const Scaffold(body: Text('로그인화면'))),
  ]);
  await t.pumpWidget(ProviderScope(
    overrides: [
      authRepoProvider.overrideWithValue(auth),
      pushServiceProvider.overrideWithValue(push),
      myProfileProvider.overrideWith((ref) async => _me),
      hospitalInfoProvider.overrideWith((ref) async => const HospitalInfo(phone: '02', address: '강남구')),
      if (offline) connectivityProvider.overrideWith((ref) => Stream.value(false)),
    ],
    child: MaterialApp.router(theme: AppTheme.theme, routerConfig: router),
  ));
  await t.pumpAndSettle();
  return (auth, push);
}

Future<void> _confirmLogout(WidgetTester t) async {
  await t.tap(find.byKey(const Key('logout-button')));
  await t.pumpAndSettle();
  await t.tap(find.text('로그아웃').last);
  await t.pumpAndSettle();
}

void main() {
  testWidgets('[SET-OUT-03·04·06] 평범한 버튼 → 안심시키는 확인 팝업', (t) async {
    await _pump(t);
    await t.tap(find.byKey(const Key('logout-button')));
    await t.pumpAndSettle();
    expect(find.textContaining('예약 내용은 그대로 남아 있습니다'), findsOneWidget);
    expect(find.text('그대로 둘게요'), findsOneWidget);
    expect(find.text('로그아웃'), findsWidgets);
  });

  testWidgets('[SET-OUT-07·08·11] 실행하면 토큰 해제·세션 삭제 후 로그인 화면으로', (t) async {
    final (auth, push) = await _pump(t);
    await _confirmLogout(t);
    expect(auth.signOutCalls, 1);       // SET-OUT-07
    expect(push.unregisterCalls, 1);    // SET-OUT-08
    expect(find.text('로그인화면'), findsOneWidget); // SET-OUT-11
  });

  testWidgets('[SET-OUT-09] 토큰 해제가 실패해도 로그아웃은 진행한다', (t) async {
    final (auth, _) = await _pump(t, failUnregister: true);
    await _confirmLogout(t);
    expect(auth.signOutCalls, 1);
    expect(find.text('로그인화면'), findsOneWidget);
  });

  testWidgets('[SET-OUT-12] 오프라인이어도 로그아웃은 된다', (t) async {
    final (auth, _) = await _pump(t, offline: true);
    await _confirmLogout(t);
    expect(auth.signOutCalls, 1);
    expect(find.text('로그인화면'), findsOneWidget);
  });
}
