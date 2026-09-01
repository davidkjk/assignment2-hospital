import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/cards/c_cancel_reject_card.dart';

void main() {
  Map<String, dynamic> p({String state = 'before', String? reason = '진료 준비가 이미 시작되었습니다'}) =>
      {'state': state, 'reason': reason};

  testWidgets('[CCARD-CANCELREJ-SHOW-01] 직원 취소 불가 답변이면 반려 카드 삽입', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CCancelRejectCard(
        payload: p(), onAck: () {}, onReinquire: () {}))));
    expect(find.byType(CCancelRejectCard), findsOneWidget);
  });

  testWidgets('[CCARD-CANCELREJ-STATE-01] 확인 전 안내는 앱 재실행 뒤에도 유지', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CCancelRejectCard(
        payload: p(state: 'before'), onAck: () {}, onReinquire: () {}))));
    expect(find.text('확인'), findsOneWidget); // 확인 전엔 [확인] 노출(상태는 서버 저장분)
  });

  testWidgets('[CCARD-CANCELREJ-REASON-01] 직원 사유를 요약·순화 없이 그대로 표시', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CCancelRejectCard(
        payload: p(reason: '진료 준비가 이미 시작되었습니다'), onAck: () {}, onReinquire: () {}))));
    expect(find.text('진료 준비가 이미 시작되었습니다'), findsOneWidget);
  });

  testWidgets('[CCARD-CANCELREJ-EXC-01] 사유 누락이면 지어내지 않고 안내 + [확인]은 여전히 동작', (t) async {
    var acked = false;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CCancelRejectCard(
        payload: p(reason: null), onAck: () => acked = true, onReinquire: () {}))));
    expect(find.textContaining('사유가 전달되지 않았'), findsOneWidget); // 지어내지 않음
    await t.tap(find.text('확인'));
    expect(acked, isTrue);                                              // 막다른 길 아님
  });

  testWidgets('[CCARD-CANCELREJ-LINK-01] [다시 문의하기]는 횟수 제한 없이 예약 맥락 상담방을 연다', (t) async {
    var reinquired = false;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CCancelRejectCard(
        payload: p(), onAck: () {}, onReinquire: () => reinquired = true))));
    await t.tap(find.text('다시 문의하기'));
    expect(reinquired, isTrue);
  });
}
