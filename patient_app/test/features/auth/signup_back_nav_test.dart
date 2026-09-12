import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:hospital_patient_app/core/phone_cooldown.dart';
import 'package:hospital_patient_app/core/profile_status.dart';
import 'package:hospital_patient_app/core/router.dart';
import 'package:hospital_patient_app/core/session_guard.dart';
import 'package:hospital_patient_app/features/auth/auth_repo.dart';
import 'package:hospital_patient_app/features/auth/auth_state.dart';
import 'package:hospital_patient_app/features/auth/consent_screen.dart';
import 'package:hospital_patient_app/features/auth/otp_screen.dart';
import 'package:hospital_patient_app/features/auth/signup_phone_screen.dart';
import 'package:hospital_patient_app/features/auth/signup_profile_screen.dart';

// 화면 렌더·네비게이션만 검증하므로 발송/검증은 얇은 Fake로 대체한다(Supabase 미초기화 회피).
class _FakeAuthRepo extends Fake implements AuthRepo {
  @override
  Future<void> sendSignupOtp(String phone) async {} // 전화 → 인증 전환에서만 불린다
}

class _FakeProfileRepo extends Fake implements SignupProfileRepo {}

class _MockStorage extends Mock implements FlutterSecureStorage {}

PhoneCooldownStore _memCooldown() {
  final s = _MockStorage();
  final m = <String, String?>{};
  when(() => s.write(key: any(named: 'key'), value: any(named: 'value'))).thenAnswer(
      (i) async => m[i.namedArguments[#key] as String] = i.namedArguments[#value] as String?);
  when(() => s.read(key: any(named: 'key')))
      .thenAnswer((i) async => m[i.namedArguments[#key] as String]);
  when(() => s.delete(key: any(named: 'key')))
      .thenAnswer((i) async => m.remove(i.namedArguments[#key] as String));
  return PhoneCooldownStore(s);
}

List<Override> _overrides() => [
      authRepoProvider.overrideWithValue(_FakeAuthRepo()),
      signupProfileRepoProvider.overrideWithValue(_FakeProfileRepo()),
      phoneCooldownStoreProvider.overrideWithValue(_memCooldown()),
      effectiveAuthProvider.overrideWithValue(AuthStatus.signedOut),
      profileMissingProvider.overrideWithValue(false),
    ];

void main() {
  // [AUTH-SIGNUP-05][NAV-AUTH-03] 동의 → 전화 → 인증은 push로 이어져 각 단계에 뒤로가기가 살아 있다.
  // 옛 구현은 context.go(스택 교체)라 전화·인증 화면이 막다른 길이었다(2026-09-08 사용자 실사용 발견).
  testWidgets('가입 ①전화·②인증 화면에 뒤로가기 버튼이 있다(막다른 길 아님)', (t) async {
    final router = buildAppRouter(initialLocation: '/signup');
    await t.pumpWidget(ProviderScope(
        overrides: _overrides(), child: MaterialApp.router(routerConfig: router)));
    await t.pumpAndSettle();

    // ⓪ 동의 — 필수 3개 켜고 다음(랜딩에서 왔을 때만 뒤로가기가 있어 여기선 검증하지 않는다)
    expect(find.byType(ConsentScreen), findsOneWidget);
    await t.tap(find.text('필수 항목에 모두 동의'));
    await t.pumpAndSettle();
    await t.tap(find.text('다음'));
    await t.pumpAndSettle();

    // ① 전화 — 동의(⓪)로 돌아갈 뒤로가기가 있어야 한다
    expect(find.byType(SignupPhoneScreen), findsOneWidget);
    expect(find.byType(BackButton), findsOneWidget);

    // 전화 입력 → 인증으로
    await t.enterText(find.byType(TextField), '01011112222');
    await t.tap(find.text('인증번호 받기'));
    await t.pump(); // 비동기 submit 시작
    await t.pump(const Duration(milliseconds: 400)); // 라우트 전환 애니메이션(OTP는 periodic 타이머라 pumpAndSettle 금지)

    // ② 인증 — 전화(①)로 돌아갈 뒤로가기가 있어야 한다(사용자 보고 증상의 핵심)
    expect(find.byType(OtpScreen), findsOneWidget);
    expect(find.byType(BackButton), findsWidgets);

    // 뒤로 누르면 전화 단계로 복귀한다(스택이 살아 있다)
    await t.tap(find.byType(BackButton).last); // 사용자가 실제로 보는 것은 맨 위(OTP)의 뒤로가기
    await t.pumpAndSettle(); // OTP가 pop되며 타이머가 dispose돼 정착한다
    expect(find.byType(SignupPhoneScreen), findsOneWidget);
    expect(find.byType(OtpScreen), findsNothing);
  });
}
