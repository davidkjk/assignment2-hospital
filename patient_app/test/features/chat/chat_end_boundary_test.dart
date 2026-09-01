import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/widgets/chat_end_boundary.dart';

void main() {
  testWidgets('[CHAT-ROOM-END-01] 종료 경계를 같은 피드에 기록하고 완료 티켓 재개 버튼을 두지 않는다', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatEndBoundary(
        onResumeAi: () {}, onNewQuestion: () {}))));
    expect(find.textContaining('상담이 종료'), findsOneWidget);
    expect(find.text('상담 재개'), findsNothing); // 완료 티켓 다시 열기 없음
  });

  testWidgets('[CHAT-ROOM-END-NAV-01] 종료 뒤 [이어서 AI 질문]과 [새 질문]을 함께 표시', (t) async {
    String? which;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatEndBoundary(
        onResumeAi: () => which = 'resume', onNewQuestion: () => which = 'new'))));
    expect(find.text('이어서 AI 질문'), findsOneWidget);
    expect(find.text('새 질문'), findsOneWidget);
    await t.tap(find.text('이어서 AI 질문'));
    expect(which, 'resume'); // 직전 직원 상담 요약을 가진 새 AI 상담(요약=서버)
  });
}
