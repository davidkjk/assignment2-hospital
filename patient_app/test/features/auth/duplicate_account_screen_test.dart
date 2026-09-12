import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/auth/auth_repo.dart';
import 'package:hospital_patient_app/features/auth/duplicate_account_screen.dart';

class _FakeAuth extends Fake implements AuthRepo {
  int signOutCalls = 0;
  @override
  Future<void> signOut() async => signOutCalls++;
}

DuplicateAccountScreen _screen(_FakeAuth a, {void Function(String)? onNavigate}) =>
    DuplicateAccountScreen(
      phone: '01011115678',
      repo: a,
      onLogin: () => onNavigate?.call('login'),
      onChangePassword: () => onNavigate?.call('new-password'),
      onRecentlyReceived: () => onNavigate?.call('phone-change'),
    );

void main() {
  testWidgets('[AUTH-DUP-02] 안내 문구와 두 버튼 + 셋째 줄이 있다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth())));
    expect(find.text('이미 가입하신 번호입니다'), findsOneWidget);
    expect(find.text('로그인하러 가기'), findsOneWidget);
    expect(find.text('비밀번호 바꾸기'), findsOneWidget);
    expect(find.textContaining('이 번호를 최근에 새로 받으셨나요?'), findsOneWidget); // AUTH-DUP-14
  });

  testWidgets('[AUTH-DUP-16] [비밀번호 바꾸기]를 없애지 않는다(진짜 환자가 더 많다)', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth())));
    expect(find.text('비밀번호 바꾸기'), findsOneWidget);
  });

  testWidgets('[AUTH-DUP-03][AUTH-DUP-04][NAV-AUTH-06] [로그인하러 가기]는 세션을 버리고 로그인으로',
      (t) async {
    final a = _FakeAuth();
    String? nav;
    await t.pumpWidget(MaterialApp(home: _screen(a, onNavigate: (d) => nav = d)));
    await t.tap(find.text('로그인하러 가기'));
    await t.pumpAndSettle();
    expect(a.signOutCalls, 1); // 문자 인증으로 생긴 세션을 버린다(모순 방지)
    expect(nav, 'login');
  });

  testWidgets('[AUTH-DUP-05] [로그인하러 가기]는 곧바로 홈으로 보내지 않는다', (t) async {
    String? nav;
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth(), onNavigate: (d) => nav = d)));
    await t.tap(find.text('로그인하러 가기'));
    await t.pumpAndSettle();
    expect(nav, isNot('home')); // 문자 인증만으로 로그인되지 않는다
  });

  testWidgets('[AUTH-DUP-09][NAV-AUTH-07] [비밀번호 바꾸기]는 새 비밀번호 화면으로(세션 유지)', (t) async {
    final a = _FakeAuth();
    String? nav;
    await t.pumpWidget(MaterialApp(home: _screen(a, onNavigate: (d) => nav = d)));
    await t.tap(find.text('비밀번호 바꾸기'));
    await t.pumpAndSettle();
    expect(nav, 'new-password');
    expect(a.signOutCalls, 0); // 세션을 유지해야 서버 경유 재설정이 통과한다
  });

  testWidgets('[AUTH-DUP-14] 셋째 줄 → 번호 변경 안내(앱은 판정하지 않는다)', (t) async {
    String? nav;
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth(), onNavigate: (d) => nav = d)));
    await t.tap(find.textContaining('이 번호를 최근에 새로 받으셨나요?'));
    await t.pumpAndSettle();
    expect(nav, 'phone-change');
  });
}
