import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/profile_status.dart';
import 'package:hospital_patient_app/core/router.dart';
import 'package:hospital_patient_app/core/session_guard.dart';
import 'package:hospital_patient_app/features/auth/auth_repo.dart';
import 'package:hospital_patient_app/features/auth/auth_state.dart';
import 'package:hospital_patient_app/features/auth/login_screen.dart';
import 'package:hospital_patient_app/features/auth/password_find_screen.dart';
import 'package:hospital_patient_app/features/auth/phone_change_screen.dart';
import 'package:hospital_patient_app/features/auth/reauth_screen.dart';
import 'package:hospital_patient_app/features/auth/signup_profile_screen.dart';

// 라우트 렌더만 검증하므로 authRepo·signupProfileRepo는 호출되지 않는 얇은 Fake로 대체한다
// (Supabase.instance 미초기화 회피 — 실제 배관은 auth_repo_test가 검증).
class _FakeAuthRepo extends Fake implements AuthRepo {}

class _FakeProfileRepo extends Fake implements SignupProfileRepo {}

List<Override> _overrides({
  AuthStatus auth = AuthStatus.signedIn,
  bool profileMissing = false,
}) =>
    [
      authRepoProvider.overrideWithValue(_FakeAuthRepo()),
      signupProfileRepoProvider.overrideWithValue(_FakeProfileRepo()),
      effectiveAuthProvider.overrideWithValue(auth),
      profileMissingProvider.overrideWithValue(profileMissing),
    ];

Future<void> _pump(WidgetTester t, String location) async {
  final router = buildAppRouter(initialLocation: location); // 테스트가 시작 위치를 준다
  await t.pumpWidget(ProviderScope(
      overrides: _overrides(), child: MaterialApp.router(routerConfig: router)));
  await t.pumpAndSettle();
}

void main() {
  testWidgets('[NAV-AUTH-01] /login → 로그인 화면', (t) async {
    await _pump(t, '/login');
    expect(find.byType(LoginScreen), findsOneWidget);
  });

  testWidgets('[NAV-AUTH-11] /password-find → 비밀번호 찾기 ①', (t) async {
    await _pump(t, '/password-find');
    expect(find.byType(PasswordFindScreen), findsOneWidget);
  });

  testWidgets('[NAV-AUTH-12] /phone-change → 번호 변경 안내', (t) async {
    await _pump(t, '/phone-change');
    expect(find.byType(PhoneChangeScreen), findsOneWidget);
  });

  testWidgets('[NAV-AUTH-17] /reauth?next=/settings → 재인증 화면', (t) async {
    await _pump(t, '/reauth?next=/settings');
    expect(find.byType(ReauthScreen), findsOneWidget);
  });

  testWidgets('[NAV-AUTH-19] 로그인 전 화면에는 하단 탭이 없다', (t) async {
    await _pump(t, '/login');
    expect(find.byType(BottomNavigationBar), findsNothing);
  });

  test('[AUTH-REAUTH-05] 민감 경로 판정 — 가족·설정만', () {
    expect(isSensitiveLocation('/family'), isTrue);
    expect(isSensitiveLocation('/settings/notifications'), isTrue);
    expect(isSensitiveLocation('/home'), isFalse);
    expect(isSensitiveLocation('/booking'), isFalse);
  });

  testWidgets('[AUTH-SESS-01][NAV-AUTH-09] 자동 로그인 — 다시 켜도 매번 로그인시키지 않는다', (t) async {
    // effectiveAuthProvider가 signedIn이면 보호 경로가 /login으로 튕기지 않는다(리다이렉트 없음).
    final router = buildAppRouter(initialLocation: '/home');
    await t.pumpWidget(ProviderScope(
        overrides: _overrides(auth: AuthStatus.signedIn, profileMissing: false),
        child: MaterialApp.router(routerConfig: router)));
    await t.pumpAndSettle();
    expect(router.routerDelegate.currentConfiguration.uri.path, '/home'); // 로그인으로 안 튕긴다
  });

  test('[AUTH-SESS-02] 갱신표 회전이 켜져 있어 30분마다 로그인하지 않는다', () {
    // flutter test의 작업 디렉토리는 patient_app이라 config는 상위(../supabase). CI 루트 실행도 대비.
    final candidates = ['../supabase/config.toml', 'supabase/config.toml'];
    final path = candidates.firstWhere((p) => File(p).existsSync(),
        orElse: () => candidates.first);
    final cfg = File(path).readAsStringSync();
    expect(cfg.contains('enable_refresh_token_rotation = true'), isTrue);
  });
}
