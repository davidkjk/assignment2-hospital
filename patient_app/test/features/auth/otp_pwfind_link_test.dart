import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/phone_cooldown.dart';
import 'package:hospital_patient_app/features/auth/otp_screen.dart';
import 'package:mocktail/mocktail.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class _MockStorage extends Mock implements FlutterSecureStorage {}

PhoneCooldownStore _store() {
  final s = _MockStorage();
  when(() => s.read(key: any(named: 'key'))).thenAnswer((_) async => null);
  when(() => s.write(key: any(named: 'key'), value: any(named: 'value')))
      .thenAnswer((_) async {});
  return PhoneCooldownStore(s);
}

OtpScreen _screen(OtpPurpose purpose) => OtpScreen(
      phone: '01011115678',
      purpose: purpose,
      cooldown: _store(),
      onResend: () async {},
      onVerify: (_) async => null,
      onSuccess: () {},
    );

void main() {
  testWidgets('[AUTH-PWFIND-06] 비밀번호 찾기 인증 화면에 「문자가 오지 않나요?」 링크가 있다', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(OtpPurpose.passwordFind)));
    expect(find.text('문자가 오지 않나요?'), findsOneWidget);
  });

  testWidgets('[NAV-AUTH-16] 가입 목적 인증 화면에는 그 링크가 없다(목적별 분기)', (t) async {
    await t.pumpWidget(MaterialApp(home: _screen(OtpPurpose.signup)));
    expect(find.text('문자가 오지 않나요?'), findsNothing);
  });
}
