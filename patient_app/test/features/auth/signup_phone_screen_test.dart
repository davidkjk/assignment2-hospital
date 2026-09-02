import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:hospital_patient_app/core/phone_cooldown.dart';
import 'package:hospital_patient_app/features/auth/signup_phone_screen.dart';

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

/// 발송을 흉내내는 Fake — 실제로 몇 번 불렸는지 센다.
class _FakeSender implements AuthOtpSender {
  int sent = 0;
  @override
  Future<void> sendSignupOtp(String phone) async => sent++;
}

void main() {
  test('[AUTH-PHONE-03] 처음 제출하면 발송하고 쿨다운을 시작한다(sent)', () async {
    final sender = _FakeSender();
    final cooldown = PhoneCooldownStore(_mem());
    final ctrl = SignupPhoneController(sender, cooldown);
    final r = await ctrl.submit('01011112222', DateTime(2026, 8, 17, 10, 0));
    expect(r, PhoneSendResult.sent);
    expect(sender.sent, 1);
    expect(cooldown.remainingSeconds('01011112222', DateTime(2026, 8, 17, 10, 0)), greaterThan(0));
  });

  test('[AUTH-PHONE-04] 쿨다운이 남은 번호는 새로 보내지 않고 그대로 ②로 넘어간다(alreadySent)', () async {
    final sender = _FakeSender();
    final cooldown = PhoneCooldownStore(_mem());
    await cooldown.start('01011112222', DateTime(2026, 8, 17, 10, 0)); // 방금 보낸 상태
    final ctrl = SignupPhoneController(sender, cooldown);
    // 5초 뒤(쿨다운 30초 안). DateTime의 5번째 인자는 '초'다(플랜의 10,5=5분 오타 교정).
    final r = await ctrl.submit('01011112222', DateTime(2026, 8, 17, 10, 0, 5));
    expect(r, PhoneSendResult.alreadySent);
    expect(sender.sent, 0); // 새로 보내지 않는다
  });

  testWidgets('[AUTH-PHONE-01] 안내문 두 줄(문자 발송 + 병원 연락 번호)', (t) async {
    await t.pumpWidget(MaterialApp(
        home: SignupPhoneScreen(
            controller: SignupPhoneController(_FakeSender(), PhoneCooldownStore(_mem())))));
    expect(find.textContaining('문자로 인증번호를 보내드립니다'), findsOneWidget);
    expect(find.textContaining('병원에서 연락드릴 때도 이 번호를 씁니다'), findsOneWidget);
  });

  testWidgets('[AUTH-PHONE-02] 형식이 틀린 번호는 인증번호를 받을 수 없다(검증 문구)', (t) async {
    await t.pumpWidget(MaterialApp(
        home: SignupPhoneScreen(
            controller: SignupPhoneController(_FakeSender(), PhoneCooldownStore(_mem())))));
    await t.enterText(find.byType(TextField), '010123'); // 짧음
    await t.tap(find.text('인증번호 받기'));
    await t.pump();
    expect(find.textContaining('전화번호'), findsWidgets); // 칸 아래 오류(FieldTextInput)
  });
}
