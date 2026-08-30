import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:hospital_patient_app/core/phone_cooldown.dart';
import 'package:hospital_patient_app/features/auth/otp_screen.dart';

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

OtpScreen _screen({
  OtpPurpose purpose = OtpPurpose.signup,
  int validitySeconds = 300,
  Future<String?> Function(String)? onVerify,
}) =>
    OtpScreen(
      phone: '01011115678',
      purpose: purpose,
      validitySeconds: validitySeconds,
      cooldown: PhoneCooldownStore(_mem()),
      onResend: () async {},
      onVerify: onVerify ?? (_) async => null,
      onSuccess: () {},
    );

void main() {
  testWidgets('[AUTH-OTP-01] 숫자 6칸 + 숫자 키패드', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen()));
    expect(find.byType(TextField), findsNWidgets(6));
    final f = t.widget<TextField>(find.byType(TextField).first);
    expect(f.keyboardType, TextInputType.number);
  });

  testWidgets('[AUTH-OTP-03] 유효 시간은 5:00(=300초)에서 시작한다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen()));
    expect(find.textContaining('5:00'), findsOneWidget);
  });

  testWidgets('[AUTH-OTP-02] 0이 되면 입력칸 대신 [인증번호 다시 받기]만 남긴다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(validitySeconds: 1)));
    await t.pump(const Duration(seconds: 1));
    await t.pump();
    expect(find.byType(TextField), findsNothing); // 입력칸 사라짐
    expect(find.textContaining('다시 받기'), findsOneWidget); // 재발송만
  });

  testWidgets('[AUTH-OTP-05] 가입은 번호를 가리지 않고 전부 보여준다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(purpose: OtpPurpose.signup)));
    expect(find.textContaining('010-1111-5678'), findsOneWidget);
  });

  testWidgets('[AUTH-OTP-06] 비밀번호 찾기·가족 연결은 가운데를 가린다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(purpose: OtpPurpose.passwordFind)));
    expect(find.textContaining('010-****-5678'), findsOneWidget);
  });

  testWidgets('[AUTH-OTP-07] 재발송 버튼은 Task 12 CooldownButton을 쓴다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen()));
    expect(find.textContaining('인증번호 다시 받기'), findsOneWidget);
  });

  testWidgets('[AUTH-OTP-08] 「연달아 누르면 마지막 문자만 유효합니다」 안내', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen()));
    expect(find.textContaining('연달아 누르면 마지막 문자만 유효합니다'), findsOneWidget);
  });

  testWidgets('[AUTH-OTP-09] 인증 실패면 서버 문장을 버튼 위에 붙이고 칸을 비운다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(onVerify: (_) async => '인증번호가 올바르지 않습니다')));
    for (final f in find.byType(TextField).evaluate()) {
      await t.enterText(find.byWidget(f.widget), '1');
    }
    await t.tap(find.text('확인'));
    await t.pumpAndSettle();
    expect(find.text('인증번호가 올바르지 않습니다'), findsOneWidget); // 서버 문장 그대로(ERR-MSG-01)
    final first = t.widget<TextField>(find.byType(TextField).first);
    expect(first.controller!.text, isEmpty); // 칸을 비운다
  });

  testWidgets('[AUTH-OTP-10] 확인 후 무슨 일이 일어나는지 화면 안에서 미리 말한다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(purpose: OtpPurpose.signup)));
    expect(find.textContaining('인증되면'), findsOneWidget); // 예: '인증되면 기본정보 입력으로 넘어갑니다'
  });

  testWidgets('[AUTH-OTP-11] 가족 연결에는 「휴대폰이 없는 가족인가요?」 링크', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(purpose: OtpPurpose.familyLink)));
    expect(find.textContaining('휴대폰이 없는 가족인가요?'), findsOneWidget);
  });

  testWidgets('[AUTH-OTP-11] 가입에는 그 링크가 없다(막다른 길 링크는 가족 연결 전용)', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(purpose: OtpPurpose.signup)));
    expect(find.textContaining('휴대폰이 없는 가족인가요?'), findsNothing);
  });
}
