import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/auth/signup_flow.dart';

void main() {
  testWidgets('[AUTH-SIGNUP-03] 점 4개 + N단계/4단계', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: SignupProgress(step: 3))));
    expect(find.text('3단계 / 4단계'), findsOneWidget);
    // 점 4개(고유 키 'signup-dot-N'을 접두어로 센다 — 형제 간 중복 키 금지 교정).
    final dots = find.byWidgetPredicate(
        (w) => w.key is ValueKey && '${(w.key as ValueKey).value}'.startsWith('signup-dot'));
    expect(dots, findsNWidgets(4));
  });

  test('[AUTH-SIGNUP-01] 가입 단계는 별도 화면 4개다(⓪=1 ①=2 ②=3 ③=4)', () {
    // 진행점의 단계 매핑이 4단계로 고정. 한 화면 조건부(AUTH-SIGNUP-02)가 아니라 라우트가 4개.
    expect(SignupStep.values.map((s) => s.display),
        ['1단계 / 4단계', '2단계 / 4단계', '3단계 / 4단계', '4단계 / 4단계']);
  });

  test('[AUTH-SIGNUP-04] 진행 표시가 인증번호 화면을 3단계로 센다(1→1→3 오류를 바로잡음)', () {
    expect(SignupStep.otp.display, '3단계 / 4단계'); // ② 인증번호 = 3단계
  });
}
