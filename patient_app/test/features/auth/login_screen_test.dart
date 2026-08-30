import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/auth/auth_repo.dart';
import 'package:hospital_patient_app/features/auth/login_screen.dart';

/// 성공/실패를 골라 돌려주는 얇은 Fake(로그인만 쓰므로 나머지는 미구현).
class _FakeAuth extends Fake implements AuthRepo {
  String? loginResult; // null=성공
  int loginCalls = 0;
  @override
  Future<String?> signInWithPassword(String phone, String password) async {
    loginCalls++;
    return loginResult;
  }
}

LoginScreen _screen(_FakeAuth a, {String? prefillPhone, void Function(String)? onNavigate}) =>
    LoginScreen(
      controller: LoginController(a),
      prefillPhone: prefillPhone,
      onSuccess: () => onNavigate?.call('home'),
      onForgot: () => onNavigate?.call('forgot'),
      onPhoneChanged: () => onNavigate?.call('phone-change'),
    );

void main() {
  testWidgets('[AUTH-LOGIN-01] 전화번호 + 비밀번호 두 칸, 문자 인증 칸은 없다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth())));
    expect(find.byKey(const Key('login-phone')), findsOneWidget);
    expect(find.byKey(const Key('login-password')), findsOneWidget);
    expect(find.textContaining('인증번호'), findsNothing); // OTP 칸 없음
  });

  testWidgets('[AUTH-LOGIN-02] 전화번호 칸은 숫자 키패드 + 앱이 하이픈을 넣는다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth())));
    final tf = t.widget<TextField>(find.byKey(const Key('login-phone')));
    expect(tf.keyboardType, TextInputType.phone);
    await t.enterText(find.byKey(const Key('login-phone')), '01011115678');
    await t.pump();
    expect(find.text('010-1111-5678'), findsOneWidget); // 사용자는 하이픈을 치지 않았다
  });

  testWidgets('[AUTH-LOGIN-03] 비밀번호 칸에 눈 토글(기본 가림)', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth())));
    final pw = t.widget<TextField>(find.byKey(const Key('login-password')));
    expect(pw.obscureText, isTrue); // 기본 가림
    expect(find.byIcon(Icons.visibility_off), findsOneWidget);
  });

  testWidgets('[AUTH-LOGIN-04] 확인 칸을 두지 않는다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth())));
    expect(find.byKey(const Key('login-password-confirm')), findsNothing);
  });

  testWidgets('[AUTH-LOGIN-05] 실패는 어느 쪽이 틀렸는지 말하지 않는 한 문장', (t) async {
    final a = _FakeAuth()..loginResult = '전화번호 또는 비밀번호가 올바르지 않습니다';
    await t.pumpWidget(MaterialApp(home: _screen(a)));
    await t.enterText(find.byKey(const Key('login-phone')), '01011115678');
    await t.enterText(find.byKey(const Key('login-password')), 'wrongpw12');
    await t.tap(find.widgetWithText(FilledButton, '로그인'));
    await t.pumpAndSettle();
    expect(find.text('전화번호 또는 비밀번호가 올바르지 않습니다'), findsOneWidget);
    expect(find.textContaining('비밀번호가 틀렸'), findsNothing); // 원인을 나누지 않는다
  });

  testWidgets('[AUTH-LOGIN-06] 여러 번 실패해도 버튼이 잠기지 않는다', (t) async {
    final a = _FakeAuth()..loginResult = '전화번호 또는 비밀번호가 올바르지 않습니다';
    await t.pumpWidget(MaterialApp(home: _screen(a)));
    await t.enterText(find.byKey(const Key('login-phone')), '01011115678');
    await t.enterText(find.byKey(const Key('login-password')), 'wrongpw12');
    for (var i = 0; i < 5; i++) {
      await t.tap(find.widgetWithText(FilledButton, '로그인'));
      await t.pumpAndSettle();
    }
    expect(a.loginCalls, 5); // 다섯 번째도 서버를 부른다(계정을 잠그지 않는다)
  });

  testWidgets('[AUTH-LOGIN-07][NAV-AUTH-11] 「비밀번호를 잊으셨나요?」 → 비밀번호 찾기', (t) async {
    String? nav;
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth(), onNavigate: (d) => nav = d)));
    await t.tap(find.text('비밀번호를 잊으셨나요?'));
    expect(nav, 'forgot');
  });

  testWidgets('[AUTH-LOGIN-08][NAV-AUTH-12] 「전화번호가 바뀌어…」 → 번호 변경 안내', (t) async {
    String? nav;
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth(), onNavigate: (d) => nav = d)));
    await t.tap(find.textContaining('전화번호가 바뀌어'));
    expect(nav, 'phone-change');
  });

  testWidgets('[AUTH-LOGIN-09][NAV-AUTH-10] 성공하면 홈으로 보낸다', (t) async {
    String? nav;
    await t.pumpWidget(MaterialApp(home: _screen(_FakeAuth(), onNavigate: (d) => nav = d)));
    await t.enterText(find.byKey(const Key('login-phone')), '01011115678');
    await t.enterText(find.byKey(const Key('login-password')), 'rightpw12');
    await t.tap(find.widgetWithText(FilledButton, '로그인'));
    await t.pumpAndSettle();
    expect(nav, 'home'); // 랜딩·로그인은 뒤로가기로 돌아갈 수 없다(라우트가 go로 교체 — Step 7)
  });
}
