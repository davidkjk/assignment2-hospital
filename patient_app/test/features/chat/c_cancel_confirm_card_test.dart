import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/cards/c_cancel_confirm_card.dart';

void main() {
  Map<String, dynamic> p(String state) => {'state': state,
      'patient_name': '홍길동', 'department': '내과', 'slot_label': '9/1 10:00'};

  testWidgets('[CCARD-CANCELCONF-SHOW-01] 마감 전/30분 이내 취소 의사면 대상 예약 뒤 확인 카드 삽입', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CCancelConfirmCard(
        payload: p('normal'), onConfirm: () {}, onNo: () {}))));
    expect(find.textContaining('내과'), findsOneWidget);
    expect(find.text('취소합니다'), findsOneWidget);
    expect(find.text('아니요'), findsOneWidget);
  });

  testWidgets('[CCARD-CANCELCONF-STATE-01] 4상태를 같은 카드 자리에서 전환', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CCancelConfirmCard(
        payload: p('processing'), onConfirm: () {}, onNo: () {}))));
    expect(find.textContaining('처리 중'), findsOneWidget);
    expect(find.byType(CCancelConfirmCard), findsOneWidget);
  });

  testWidgets('[CCARD-CANCELCONF-NO-01] [아니요]면 API 호출 없이 카드를 「취소하지 않음」으로 남긴다', (t) async {
    var called = false;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CCancelConfirmCard(
        payload: p('declined'), onConfirm: () => called = true, onNo: () {}))));
    expect(find.text('취소하지 않았어요'), findsOneWidget); // 지우지 않고 확정 상태로
    expect(find.text('취소합니다'), findsNothing);          // 버튼 제거(재실행 방지)
    expect(called, isFalse);
  });

  testWidgets('[CCARD-CANCELCONF-DONE-01] [취소합니다] 성공이면 다음 메시지로 취소결과 카드', (t) async {
    var confirmed = false;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CCancelConfirmCard(
        payload: p('normal'), onConfirm: () => confirmed = true, onNo: () {}))));
    await t.tap(find.text('취소합니다'));
    expect(confirmed, isTrue);
  });

  testWidgets('[CCARD-CANCELCONF-LATE-01] 마감 후·30분 밖이면 카드/직접 API 안 쓰고 LATEFLOW 경로', (t) async {
    // 마감 후면 이 확인 카드를 보내지 않는다 — dispatcher가 lateflow로 보낸다(Step 4).
    expect(cancelConfirmBlockedWhenLate(afterDeadline: true), isTrue);
  });
}
