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

  testWidgets('[CHAT-ROOM-END-NAV-01] 결정 카드에 안내 제목·설명을 함께 보인다(목업 119 ③)', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatEndBoundary(
        onResumeAi: () {}, onNewQuestion: () {}))));
    expect(find.text('이어서 무엇을 할까요?'), findsOneWidget);            // 결정 카드 제목
    expect(find.textContaining('요약'), findsOneWidget);                    // 이어 묻기=요약 전달 안내
  });

  testWidgets('[CHAT-ROOM-AI-REOPEN-01] 라벨·문구를 만료 문맥으로 바꿔 같은 위젯을 재사용한다', (t) async {
    // 만료 방 재진입도 같은 두 분기(요약 이어가기/새로 시작)를 라벨만 바꿔 쓴다.
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatEndBoundary(
        onResumeAi: () {},
        onNewQuestion: () {},
        message: 'AI 상담이 종료되었습니다',
        title: '다시 질문하시겠어요?',
        resumeLabel: '이전 내용 이어서 질문',
        newLabel: '새 질문 시작'))));
    expect(find.text('이전 내용 이어서 질문'), findsOneWidget);
    expect(find.text('새 질문 시작'), findsOneWidget);
    expect(find.text('다시 질문하시겠어요?'), findsOneWidget);
  });
}
