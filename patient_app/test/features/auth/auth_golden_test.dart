import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import '../../support/golden_fonts.dart';
import 'package:mocktail/mocktail.dart';
import 'package:hospital_patient_app/core/phone_cooldown.dart';
import 'package:hospital_patient_app/core/sensitive_reauth.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/auth/auth_repo.dart';
import 'package:hospital_patient_app/features/auth/reauth_screen.dart';
import 'package:hospital_patient_app/features/home/main_tabs.dart';
import 'package:hospital_patient_app/widgets/app_shell.dart';
import 'package:hospital_patient_app/features/auth/consent_screen.dart';
import 'package:hospital_patient_app/features/auth/landing_screen.dart';
import 'package:hospital_patient_app/features/auth/login_screen.dart';
import 'package:hospital_patient_app/features/auth/new_password_screen.dart';
import 'package:hospital_patient_app/features/auth/otp_screen.dart';
import 'package:hospital_patient_app/features/auth/password_find_screen.dart';
import 'package:hospital_patient_app/features/auth/phone_change_screen.dart';
import 'package:hospital_patient_app/features/auth/signup_phone_screen.dart';
import 'package:hospital_patient_app/features/auth/signup_profile_screen.dart';

// 골든 게이트(핸드오프 정본): 데모(tools/shot/demo-auth-*.png)와 눈으로 대조하기 위해
// 실제 렌더를 PNG로 남긴다. AppTheme.theme(데모 디자인 시스템)를 입혀 렌더한다.

class _MockStorage extends Mock implements FlutterSecureStorage {}

_MockStorage _mem() {
  final s = _MockStorage();
  final m = <String, String?>{};
  when(() => s.write(key: any(named: 'key'), value: any(named: 'value'))).thenAnswer(
      (i) async => m[i.namedArguments[#key] as String] = i.namedArguments[#value] as String?);
  when(() => s.read(key: any(named: 'key')))
      .thenAnswer((i) async => m[i.namedArguments[#key] as String]);
  when(() => s.delete(key: any(named: 'key')))
      .thenAnswer((i) async => m.remove(i.namedArguments[#key] as String));
  return s;
}

class _FakeAuthRepo implements AuthRepo {
  @override
  Future<void> sendOtp(String phone, {required bool createUser}) async {}
  @override
  Future<void> sendSignupOtp(String phone) async {}
  @override
  Future<String?> verifyOtp(String phone, String code) async => null;
  @override
  Future<String?> signInWithPassword(String phone, String password) async => null;
  @override
  Future<String?> reauthenticate(String password) async => null;
  @override
  Future<bool> hasProfile() async => true;
  @override
  Future<void> signOut() async {}
  @override
  Future<void> reset(String name, String password) async {}
}

class _FakeOtpSender implements AuthOtpSender {
  @override
  Future<void> sendSignupOtp(String phone) async {}
}

class _FakeProfileRepo implements SignupProfileRepo {
  @override
  Future<void> setPassword(String pw) async {}
  @override
  Future<void> createProfile(
      {required String name,
      required String birthDate,
      required String gender,
      required bool adsAgreed,
      required String termsVersion}) async {}
}

Widget _wrap(Widget child) => ProviderScope(
      child: MaterialApp(theme: AppTheme.theme, home: child),
    );

// ⚠️ 골든의 tofu(□)에 대해: 본문 한글 Text는 렌더되지만, AppBar 제목·버튼 라벨·Material 아이콘은
// `flutter test` 헤드리스에서 폰트가 없어 tofu로 나온다(실기기엔 시스템 폰트·아이콘 폰트가 있어 정상).
// 즉 이 골든은 레이아웃·간격·색·본문 문구를 데모와 대조하는 용도이고, 헤더/버튼 글자는 알려진 값이다.
Future<void> _shoot(WidgetTester t, Widget screen, String name, {bool settle = true}) async {
  await t.binding.setSurfaceSize(const Size(390, 780));
  addTearDown(() => t.binding.setSurfaceSize(null));
  await t.pumpWidget(_wrap(screen));
  if (settle) {
    await t.pumpAndSettle();
  } else {
    await t.pump();
  }
  await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/auth-$name.png'));
}

void main() {
  setUpAll(() async {
    await loadGoldenFonts();
    final f = File('/System/Library/Fonts/Supplemental/AppleGothic.ttf');
    if (f.existsSync()) {
      final loader = FontLoader('Roboto')
        ..addFont(Future.value(f.readAsBytesSync().buffer.asByteData()));
      await loader.load();
    }
  });


  testWidgets('landing golden', (t) async {
    await _shoot(t, const LandingScreen(), 'landing');
  });

  testWidgets('login golden', (t) async {
    await _shoot(
        t,
        LoginScreen(
          controller: LoginController(_FakeAuthRepo()),
          onSuccess: () {},
          onForgot: () {},
          onPhoneChanged: () {},
        ),
        'login');
  });

  testWidgets('signup consent golden', (t) async {
    await _shoot(t, const ConsentScreen(), 'signup-consent');
  });

  testWidgets('signup phone golden', (t) async {
    await _shoot(
        t,
        SignupPhoneScreen(
            controller: SignupPhoneController(_FakeOtpSender(), PhoneCooldownStore(_mem()))),
        'signup-phone');
  });

  testWidgets('signup otp golden', (t) async {
    await _shoot(
        t,
        OtpScreen(
          phone: '01012345678',
          purpose: OtpPurpose.signup,
          cooldown: PhoneCooldownStore(_mem()),
          onResend: () async {},
          onVerify: (_) async => null,
          onSuccess: () {},
        ),
        'signup-otp',
        settle: false); // 주기 타이머라 settle하지 않는다
  });

  testWidgets('signup profile golden', (t) async {
    await _shoot(
        t,
        SignupProfileScreen(
            controller: SignupProfileController(_FakeProfileRepo()), onDone: () {}),
        'signup-profile');
  });

  testWidgets('phone change golden', (t) async {
    await _shoot(t, const PhoneChangeScreen(), 'phone-change');
  });

  testWidgets('password find golden', (t) async {
    await _shoot(
        t,
        PasswordFindScreen(
            controller: PasswordFindController(_FakeAuthRepo()), onSent: (_) {}),
        'password-find');
  });

  testWidgets('new password golden', (t) async {
    await _shoot(
        t,
        NewPasswordScreen(
            controller: NewPasswordController(_FakeAuthRepo()), onDone: () {}),
        'new-password');
  });

  // 재인증: 막다른 길 방지로 **셸 안(탭바 포함)** + AppBar 닫기(X)→홈(AUTH-REAUTH-02b).
  // 실제 셸(AppShell+MainTabs)로 감싸 탭바가 함께 렌더되는지 데모처럼 확인한다.
  testWidgets('reauth golden (셸 안 — 탭바 포함)', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 780));
    addTearDown(() => t.binding.setSurfaceSize(null));
    Widget stub() => const Scaffold(body: SizedBox());
    final router = GoRouter(initialLocation: '/reauth', routes: [
      ShellRoute(
        builder: (c, s, child) => AppShell(body: child, bottomTabs: const MainTabs()),
        routes: [
          GoRoute(
              path: '/reauth',
              builder: (c, s) => ReauthScreen(
                    controller: ReauthController(_FakeAuthRepo()),
                    guard: SensitiveReauthGuard(),
                    onPassed: () {},
                    onForgot: () {},
                    onCancel: () {},
                  )),
          GoRoute(path: '/home', builder: (c, s) => stub()),
          GoRoute(path: '/my', builder: (c, s) => stub()),
          GoRoute(path: '/family', builder: (c, s) => stub()),
          GoRoute(path: '/history', builder: (c, s) => stub()),
          GoRoute(path: '/chat', builder: (c, s) => stub()),
        ],
      ),
    ]);
    await t.pumpWidget(ProviderScope(
        child: MaterialApp.router(theme: AppTheme.theme, routerConfig: router)));
    await t.pumpAndSettle();
    await expectLater(
        find.byType(MaterialApp), matchesGoldenFile('goldens/auth-reauth.png'));
  });
}
