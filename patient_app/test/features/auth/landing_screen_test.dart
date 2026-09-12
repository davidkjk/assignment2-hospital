import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/auth/landing_screen.dart';

void main() {
  testWidgets('[AUTH-LAND-01] 큰 버튼 2개([로그인]·[회원가입])만, 입력칸은 없다', (t) async {
    await t.pumpWidget(const MaterialApp(home: LandingScreen()));
    expect(find.text('로그인'), findsOneWidget);
    expect(find.text('회원가입'), findsOneWidget);
    expect(find.byType(TextField), findsNothing); // 입력칸을 두지 않는다
    expect(find.byType(TextFormField), findsNothing);
  });

  testWidgets('[AUTH-LAND-02] 병원 이름 + 한 줄 소개. 탭 전환형(TabBar)을 쓰지 않는다', (t) async {
    await t.pumpWidget(const MaterialApp(home: LandingScreen()));
    expect(find.text(LandingScreen.hospitalName), findsOneWidget);
    expect(find.byType(TabBar), findsNothing); // 탭 전환형·가입 우선형 아님
  });

  testWidgets('[AUTH-LAND-03] 비밀번호를 잊으셨나요?를 랜딩에도 둔다', (t) async {
    await t.pumpWidget(const MaterialApp(home: LandingScreen()));
    expect(find.text('비밀번호를 잊으셨나요?'), findsOneWidget);
  });

  testWidgets('[AUTH-LAND-04] 로그인 전에는 하단 탭을 그리지 않는다', (t) async {
    await t.pumpWidget(const MaterialApp(home: LandingScreen()));
    final scaffold = t.widget<Scaffold>(find.byType(Scaffold));
    expect(scaffold.bottomNavigationBar, isNull);
  });
}
