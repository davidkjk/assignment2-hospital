import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/cards/c_cancel_done_card.dart';

void main() {
  testWidgets('[CCARD-CANCELDONE-SHOW-01] 취소 성공 확인 뒤 결과 카드 삽입', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: CCancelDoneCard(
        payload: {'state': 'normal', 'cancelled_by': 'self'}))));
    expect(find.byType(CCancelDoneCard), findsOneWidget);
  });

  testWidgets('[CCARD-CANCELDONE-STATE-01] 미확인 결과를 완료로 표현하지 않는다', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: CCancelDoneCard(
        payload: {'state': 'loading'}))));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.textContaining('취소되었'), findsNothing);
  });

  testWidgets('[CCARD-CANCELDONE-QNR-01] 보존 문진이면 [작성한 문진 보기]+[새로 예약하기]·자동 복사 안 함', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: CCancelDoneCard(
        payload: {'state': 'normal', 'cancelled_by': 'self', 'has_questionnaire': true}))));
    expect(find.text('작성한 문진 보기'), findsOneWidget);
    expect(find.text('새로 예약하기'), findsOneWidget);
  });

  testWidgets('[CCARD-CANCELDONE-NEW-01] [새로 예약하기]는 새 예약 시작·과거 문진 자동 복사 안 함', (t) async {
    var started = false;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CCancelDoneCard(
        payload: const {'state': 'normal', 'cancelled_by': 'self', 'has_questionnaire': true},
        onNewBooking: () => started = true))));
    await t.tap(find.text('새로 예약하기'));
    expect(started, isTrue);
  });

  testWidgets('[CCARD-CANCELDONE-EXC-01] 취소 미확정이면 결과 카드 대신 아직 예약 유지 상태', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: CCancelDoneCard(
        payload: {'state': 'pending_support'}))));
    expect(find.text('아직 예약은 유지되고 있습니다'), findsOneWidget);
    expect(find.textContaining('취소되었'), findsNothing);
  });
}
