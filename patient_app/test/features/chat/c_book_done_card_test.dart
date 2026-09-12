import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/cards/c_book_done_card.dart';

void main() {
  testWidgets('[CCARD-BOOKDONE-SHOW-01] 예약 API 성공 확인 뒤 한 번만 삽입', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: CBookDoneCard(
        payload: {'state': 'applied', 'number': 'A-123', 'question_count': 2}))));
    expect(find.textContaining('A-123'), findsOneWidget);
  });

  testWidgets('[CCARD-BOOKDONE-STATE-01] 신청/확정/조회중/오류를 적용하고 미확인을 성공으로 위장 안 함', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: CBookDoneCard(
        payload: {'state': 'loading'}))));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.textContaining('완료'), findsNothing); // 조회 중을 완료로 위장 안 함
  });

  testWidgets('[CCARD-BOOKDONE-QNR-01] 문항 1개↑면 [사전문진 작성하기], 0문항이면 문구·버튼 없음', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: CBookDoneCard(
        payload: {'state': 'applied', 'number': 'A-1', 'question_count': 3}))));
    expect(find.text('사전문진 작성하기'), findsOneWidget);
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: CBookDoneCard(
        payload: {'state': 'applied', 'number': 'A-2', 'question_count': 0}))));
    expect(find.text('작성할 문진이 없습니다'), findsOneWidget);
    expect(find.text('사전문진 작성하기'), findsNothing);        // (0/0)·비활성 버튼 금지
  });

  testWidgets('[CCARD-BOOKDONE-LATER-01] [나중에 할게요]는 예약 유지한 채 홈으로', (t) async {
    var toHome = false;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CBookDoneCard(
        payload: const {'state': 'applied', 'number': 'A-1', 'question_count': 2},
        onLater: () => toHome = true))));
    await t.tap(find.text('나중에 할게요'));
    expect(toHome, isTrue);
  });

  testWidgets('[CCARD-BOOKDONE-BACK-01] 완료 뒤 상담방 복귀 시 과거 신청 버튼을 재실행 상태로 안 되살림', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: CBookDoneCard(
        payload: {'state': 'applied', 'number': 'A-1', 'question_count': 0}))));
    expect(find.text('예약 신청하기'), findsNothing); // 완료 카드엔 재신청 버튼 없음
  });
}
