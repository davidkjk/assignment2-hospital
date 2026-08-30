import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/auth/phone_change_screen.dart';

void main() {
  testWidgets('[AUTH-TEL-01] 앱에서 번호를 바꾸지 않는다 — 입력칸이 없다', (t) async {
    await t.pumpWidget(const MaterialApp(home: PhoneChangeScreen()));
    expect(find.byType(TextField), findsNothing);
  });

  testWidgets('[AUTH-TEL-02] 본문 두 문장(방문·전화 + 이력 유지)', (t) async {
    await t.pumpWidget(const MaterialApp(home: PhoneChangeScreen()));
    expect(find.textContaining('병원에 방문하시거나 전화해 주세요'), findsOneWidget);
    expect(find.textContaining('그동안의 예약과 방문 이력은 그대로 유지됩니다'), findsOneWidget);
  });

  testWidgets('[AUTH-TEL-03] 확인 절차 세 줄을 미리 안내', (t) async {
    await t.pumpWidget(const MaterialApp(home: PhoneChangeScreen()));
    expect(find.textContaining('이름'), findsWidgets);
    expect(find.textContaining('최근 방문일'), findsOneWidget);
    expect(find.textContaining('새 번호로 인증번호'), findsOneWidget);
  });

  testWidgets('[AUTH-TEL-04] [병원 전화번호로 문의] 버튼(tel: 연결)', (t) async {
    await t.pumpWidget(const MaterialApp(home: PhoneChangeScreen()));
    expect(find.text('병원 전화번호로 문의'), findsOneWidget);
  });

  testWidgets('[AUTH-TEL-05] 방문만 요구하지 않는다 — 전화 경로가 함께 있다', (t) async {
    await t.pumpWidget(const MaterialApp(home: PhoneChangeScreen()));
    // 본문이 '방문하시거나 전화해'로 둘을 함께 제시하고, 전화 버튼이 있다.
    expect(find.text('병원 전화번호로 문의'), findsOneWidget);
    expect(find.textContaining('방문하시거나 전화'), findsOneWidget);
  });
}
