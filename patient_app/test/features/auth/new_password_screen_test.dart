import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/features/auth/new_password_screen.dart';

class _FakeReset implements PasswordResetRepo {
  int calls = 0;
  String? failWith;
  @override
  Future<void> reset(String name, String password) async {
    calls++;
    if (failWith != null) throw ApiException(failWith!);
  }
}

Future<void> _fill(WidgetTester t, {String name = '홍길동', String pw = 'abc12345'}) async {
  await t.enterText(find.byKey(const Key('name')), name);
  await t.enterText(find.byKey(const Key('newpw')), pw);
  await t.enterText(find.byKey(const Key('newpw-confirm')), pw);
  await t.pump();
}

NewPasswordScreen _screen(_FakeReset repo, {VoidCallback? onDone}) =>
    NewPasswordScreen(controller: NewPasswordController(repo), onDone: onDone ?? () {});

void main() {
  testWidgets('[AUTH-PWNEW-08] 새 비밀번호 위에 「등록하신 이름」 칸이 있다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeReset())));
    expect(find.text('등록하신 이름'), findsOneWidget);
    expect(find.byKey(const Key('name')), findsOneWidget);
  });

  testWidgets('[AUTH-PWNEW-01] 새 비밀번호 + 한 번 더, 각각 눈 토글', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeReset())));
    expect(find.byKey(const Key('newpw')), findsOneWidget);
    expect(find.byKey(const Key('newpw-confirm')), findsOneWidget);
    expect(find.byIcon(Icons.visibility_off), findsNWidgets(2)); // 두 칸 각각
  });

  testWidgets('[AUTH-PWNEW-02] 조건 네 줄(8자·영문숫자·두 칸 같음·피하기)', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeReset())));
    expect(find.textContaining('8자 이상'), findsOneWidget);
    expect(find.textContaining('영문과 숫자'), findsOneWidget);
    expect(find.textContaining('두 칸이 서로 같음'), findsOneWidget);
    expect(find.textContaining('전화번호·생년월일은 피해'), findsOneWidget);
  });

  testWidgets('[AUTH-PWNEW-03] 마지막 줄은 권고(·)라 ✓ 조건과 모양이 다르다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeReset())));
    expect(find.textContaining('· 전화번호·생년월일은 피해'), findsOneWidget); // 차단 아님(·)
  });

  testWidgets('[AUTH-PWNEW-06] 빠져나갈 문 — 비밀번호가 기억나셨나요? › 로그인하기', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeReset())));
    expect(find.textContaining('비밀번호가 기억나셨나요?'), findsOneWidget);
  });

  testWidgets('[AUTH-PWNEW-07] 「원래 쓰시던 비밀번호를 그대로 쓰셔도 됩니다」를 쓰지 않는다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeReset())));
    expect(find.textContaining('그대로 쓰셔도 됩니다'), findsNothing);
  });

  testWidgets('[AUTH-PWNEW-12] 막다른 길 방지 — 이름이 기억나지 않거나 맞지 않나요? ›', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeReset())));
    expect(find.textContaining('이름이 기억나지 않거나 맞지 않나요?'), findsOneWidget);
  });

  testWidgets('[AUTH-PWNEW-16] 생년월일까지 묻지 않는다(이름만) — 입력 칸이 없다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(_FakeReset())));
    // 칸은 이름·새 비밀번호·확인 셋뿐. 생년월일 입력 칸/날짜 선택기는 없다.
    // ('생년월일'은 비밀번호 권고 문구에만 나올 뿐 입력을 요구하지 않는다 — 플랜 결함 교정.)
    expect(find.byType(TextField), findsNWidgets(3));
    expect(find.byType(CalendarDatePicker), findsNothing);
  });

  testWidgets('[AUTH-PWNEW-17] 치는 도중에는 이름 맞다/틀리다를 알려주지 않는다 — 누를 때 한 번만', (t) async {
    final repo = _FakeReset();
    await t.pumpWidget(MaterialApp(home: _screen(repo)));
    await t.enterText(find.byKey(const Key('name')), '홍');
    await t.pump();
    expect(repo.calls, 0); // 치는 동안 서버를 부르지 않는다
    expect(find.textContaining('일치'), findsNothing); // 실시간 판정 표시 없음
  });

  testWidgets('[AUTH-PWNEW-04] 변경 성공이면 로그인 화면으로 보낸다', (t) async {
    final repo = _FakeReset();
    var done = false;
    await t.pumpWidget(MaterialApp(home: _screen(repo, onDone: () => done = true)));
    await _fill(t);
    await t.tap(find.text('비밀번호 바꾸기'));
    await t.pumpAndSettle();
    expect(repo.calls, 1);
    expect(done, isTrue); // 로그인 화면으로(다시 로그인)
  });
}
