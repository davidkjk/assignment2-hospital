import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/sensitive_reauth.dart';
import 'package:hospital_patient_app/features/auth/auth_repo.dart';
import 'package:hospital_patient_app/features/auth/reauth_screen.dart';

class _FakeAuth extends Fake implements AuthRepo {
  String? result; // null=성공
  @override
  Future<String?> reauthenticate(String password) async => result;
}

ReauthScreen _screen(_FakeAuth a, SensitiveReauthGuard g, {void Function(String)? onNavigate}) =>
    ReauthScreen(
      controller: ReauthController(a),
      guard: g,
      onPassed: () => onNavigate?.call('next'),
      onForgot: () => onNavigate?.call('forgot'),
      onCancel: () => onNavigate?.call('cancel'),
    );

void main() {
  testWidgets('[AUTH-REAUTH-01] 비밀번호 칸이다 — 인증번호(문자) 칸이 아니다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth(), SensitiveReauthGuard())));
    expect(find.byKey(const Key('reauth-password')), findsOneWidget);
    expect(find.textContaining('인증번호'), findsNothing);
  });

  testWidgets('[AUTH-REAUTH-03] 눈 토글(기본 가림)', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth(), SensitiveReauthGuard())));
    final pw = t.widget<TextField>(find.byKey(const Key('reauth-password')));
    expect(pw.obscureText, isTrue);
  });

  testWidgets('[AUTH-REAUTH-02][NAV-AUTH-17] 「비밀번호를 잊으셨나요?」 → 비밀번호 찾기', (t) async {
    String? nav;
    await t.pumpWidget(MaterialApp(
        home: _screen(_FakeAuth(), SensitiveReauthGuard(), onNavigate: (d) => nav = d)));
    await t.tap(find.text('비밀번호를 잊으셨나요?'));
    expect(nav, 'forgot');
  });

  testWidgets('[AUTH-REAUTH-02] 닫기(X) → 홈으로 나간다(막다른 길 방지: 셸 밖·redirect라 탭·뒤로 없음)', (t) async {
    String? nav;
    await t.pumpWidget(MaterialApp(
        home: _screen(_FakeAuth(), SensitiveReauthGuard(), onNavigate: (d) => nav = d)));
    await t.tap(find.byTooltip('닫기'));
    expect(nav, 'cancel');
  });

  testWidgets('[AUTH-REAUTH-04] 성공하면 가드에 통과를 기록하고 원래 화면으로', (t) async {
    final g = SensitiveReauthGuard();
    String? nav;
    await t.pumpWidget(MaterialApp(
        home: _screen(_FakeAuth()..result = null, g, onNavigate: (d) => nav = d)));
    await t.enterText(find.byKey(const Key('reauth-password')), 'mypw1234');
    await t.tap(find.text('확인'));
    await t.pumpAndSettle();
    expect(g.needsReauth, isFalse); // markPassed 됨 → 5분간 다시 안 묻는다
    expect(nav, 'next');
  });

  testWidgets('[AUTH-REAUTH-01] 틀리면 문구를 띄우고 통과시키지 않는다', (t) async {
    final g = SensitiveReauthGuard();
    await t.pumpWidget(MaterialApp(
        home: _screen(_FakeAuth()..result = '전화번호 또는 비밀번호가 올바르지 않습니다', g)));
    await t.enterText(find.byKey(const Key('reauth-password')), 'wrongpw1');
    await t.tap(find.text('확인'));
    await t.pumpAndSettle();
    expect(find.text('전화번호 또는 비밀번호가 올바르지 않습니다'), findsOneWidget);
    expect(g.needsReauth, isTrue); // 통과 기록 없음
  });
}
