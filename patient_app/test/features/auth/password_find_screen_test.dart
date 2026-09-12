import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/auth/auth_repo.dart';
import 'package:hospital_patient_app/features/auth/password_find_screen.dart';
import 'package:hospital_patient_app/features/auth/signup_phone_screen.dart'; // PhoneSendResult

class _FakeAuth extends Fake implements AuthRepo {
  bool? sentCreateUser;
  bool throwOnSend = false;
  @override
  Future<void> sendOtp(String phone, {required bool createUser}) async {
    if (throwOnSend) throw Exception('user not found');
    sentCreateUser = createUser;
  }
}

void main() {
  test('[AUTH-PWFIND-04] 발송은 shouldCreateUser:false로 나간다', () async {
    final a = _FakeAuth();
    final r = await PasswordFindController(a).submit('01011112222', DateTime(2026));
    expect(a.sentCreateUser, isFalse);
    expect(r, PhoneSendResult.sent);
  });

  test('[AUTH-PWFIND-03][AUTH-PWFIND-05] 미가입 번호라 발송이 실패해도 그대로 진행한다', () async {
    final a = _FakeAuth()..throwOnSend = true; // 가입 안 된 번호
    // 예외를 삼키고(가입 여부를 드러내지 않음) 인증 화면으로 넘어간다.
    final r = await PasswordFindController(a).submit('01099998888', DateTime(2026));
    expect(r, PhoneSendResult.sent); // 화면 흐름으로도 가입 여부를 알리지 않는다
  });

  testWidgets('[AUTH-PWFIND-01] 첫 화면은 전화번호 한 칸 + [인증번호 받기]', (t) async {
    await t.pumpWidget(MaterialApp(
      home: PasswordFindScreen(controller: PasswordFindController(_FakeAuth()), onSent: (_) {}),
    ));
    expect(find.byType(TextField), findsOneWidget);
    expect(find.text('인증번호 받기'), findsOneWidget);
  });

  testWidgets('[NAV-AUTH-13] [인증번호 받기]를 누르면 인증 화면으로(번호 전달)', (t) async {
    String? sentPhone;
    await t.pumpWidget(MaterialApp(
      home: PasswordFindScreen(
          controller: PasswordFindController(_FakeAuth()),
          onSent: (phone) => sentPhone = phone),
    ));
    await t.enterText(find.byType(TextField), '01011112222');
    await t.tap(find.text('인증번호 받기'));
    await t.pumpAndSettle();
    expect(sentPhone, '01011112222');
  });
}
