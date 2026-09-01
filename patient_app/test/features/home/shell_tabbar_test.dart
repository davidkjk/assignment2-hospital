import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/connectivity.dart';
import 'package:hospital_patient_app/core/profile_status.dart';
import 'package:hospital_patient_app/core/sensitive_reauth.dart';
import 'package:hospital_patient_app/core/router.dart';
import 'package:hospital_patient_app/core/session_guard.dart';
import 'package:hospital_patient_app/features/auth/auth_state.dart';
import 'package:hospital_patient_app/features/home/home_data.dart' show hospitalInfoProvider;
import 'package:hospital_patient_app/features/settings/settings_home_screen.dart' show myProfileProvider;

// 막다른 길 회귀 가드(2026-09-01 시뮬 검수): 로그인 후 전 화면은 전역 셸(하단 탭바)로 감싸
// 어디서든 다른 탭·홈으로 갈 수 있어야 한다. 골든은 화면을 직접 펌프해 셸을 못 보므로,
// 실 라우터(buildAppRouter)로 이동해 BottomNavigationBar 존재를 직접 단언한다.
// 데모 정본: BottomTabBar는 로그인 전(/login·/signup·/auth/*)과 QR 몰입(/qr)에서만 숨는다.

Widget _app(String initial, {List<Override> extra = const []}) => ProviderScope(
      overrides: [
        // 인증 통과 + 프로필 완료 → 로그인/가입으로 튕기지 않는다.
        effectiveAuthProvider.overrideWith((ref) => AuthStatus.signedIn),
        profileMissingProvider.overrideWith((ref) => false),
        // 민감 경로(설정·가족)라도 방금 재인증 통과로 두어 /reauth로 새지 않게(AUTH-REAUTH-04).
        sensitiveReauthGuardProvider.overrideWith((ref) => SensitiveReauthGuard()..markPassed()),
        connectivityProvider.overrideWith((ref) => Stream.value(true)),
        ...extra,
      ],
      child: MaterialApp.router(routerConfig: buildAppRouter(initialLocation: initial)),
    );

void main() {
  testWidgets('[NAV-GLOBAL] AI 상담 탭(/chat)에도 하단 탭바가 있다 — 막다른 길 아님', (t) async {
    await t.pumpWidget(_app('/chat'));
    await t.pumpAndSettle();
    expect(find.byType(BottomNavigationBar), findsOneWidget);
  });

  testWidgets('[NAV-GLOBAL] 설정(/settings)에도 하단 탭바가 있다 — 홈 복귀 가능', (t) async {
    await t.pumpWidget(_app('/settings', extra: [
      myProfileProvider.overrideWith((ref) async => null),
      hospitalInfoProvider.overrideWith((ref) async => null),
    ]));
    await t.pumpAndSettle();
    expect(find.byType(BottomNavigationBar), findsOneWidget);
  });

  // 로그인 전(/login)·QR 몰입(/qr)에 탭바가 없다는 반대편은 auth_routes_test가 이미 단언한다(중복 금지).
}
