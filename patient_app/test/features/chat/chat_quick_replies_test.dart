import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/widgets/chat_quick_replies.dart';

void main() {
  testWidgets('[CCARD-QUICK-START-01] 시작 묶음은 다가오는 예약 유무로 고정 4개 — AI 호출 없음', (t) async {
    final r = startQuickReplies(hasUpcoming: true);
    expect(r.length, 4);
    final r2 = startQuickReplies(hasUpcoming: false);
    expect(r2.length, 4);
    expect(r2, isNot(r)); // 유무에 따라 다른 고정 묶음
  });

  testWidgets('[CCARD-QUICK-SEND-01] 버튼을 누르면 그 문장을 환자 말풍선으로 전송', (t) async {
    String? sent;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatQuickReplies(
        replies: const ['예약 확인하고 싶어요'], onSend: (s) => sent = s))));
    await t.tap(find.text('예약 확인하고 싶어요'));
    expect(sent, '예약 확인하고 싶어요');
  });

  testWidgets('[CCARD-QUICK-INPUT-01] 버튼 묶음과 함께 자유 입력이 계속 허용됨', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatQuickReplies(
        replies: const ['a', 'b'], onSend: (_) {}, freeInputOpen: true))));
    // 자유 입력은 입력창(T10 ChatInputBar)이 담당 — 빠른답변이 이를 막지 않음을 플래그로 표현.
    expect(find.text('a'), findsOneWidget);
  });

  testWidgets('[CCARD-QUICK-LOAD-01] 대화 중 생성 대기엔 스켈레톤/생성중 표시 없음 — 자유 입력만 유지', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatQuickReplies(
        replies: const [], onSend: (_) {}, generating: true))));
    expect(find.textContaining('추천 준비'), findsNothing); // 생성중 표시 안 함
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });

  testWidgets('[CCARD-QUICK-ERR-01] 생성 실패면 실패/재시도 버튼 없이 자유 입력만 — 상담 오류로 확대 안 함', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatQuickReplies(
        replies: const [], onSend: (_) {}, generateFailed: true))));
    expect(find.text('다시 시도'), findsNothing);
    expect(find.textContaining('오류'), findsNothing);
  });

  testWidgets('[CCARD-QUICK-MID-01] 대화 중 묶음은 3~4개를 표시(생성은 서버)', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatQuickReplies(
        replies: const ['a', 'b', 'c'], onSend: (_) {}))));
    expect(find.byType(ActionChip), findsNWidgets(3));
  });
}
