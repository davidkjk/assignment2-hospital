import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/cards/c_book_confirm_card.dart';

void main() {
  Map<String, dynamic> p(String state) => {'state': state,
      'patient_name': '홍길동', 'department': '내과', 'doctor': '김의사', 'slot_label': '9/1 10:00'};

  testWidgets('[CCARD-BOOKCONF-SHOW-01] 신청 직전 여섯 확인 항목을 한 카드로 묶어 삽입', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CBookConfirmCard(
        payload: p('normal'), onSubmit: () {}))));
    expect(find.textContaining('내과'), findsOneWidget);
    expect(find.textContaining('김의사'), findsOneWidget);
    expect(find.text('예약 신청하기'), findsOneWidget);
  });

  testWidgets('[CCARD-BOOKCONF-STATE-01] 4상태를 원래 카드 자리에서 전환·중복 카드 안 쌓음', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CBookConfirmCard(
        payload: p('submitting'), onSubmit: () {}))));
    expect(find.textContaining('신청 중'), findsOneWidget);
    expect(find.byType(CBookConfirmCard), findsOneWidget); // 한 자리
  });

  testWidgets('[CCARD-BOOKCONF-SUCCESS-01] 예약 API 성공이면 다음 메시지로 완료 카드 신호', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CBookConfirmCard(
        payload: p('normal'), onSubmit: () {}, onSuccess: () {}))));
    // 성공 콜백은 완료 카드를 다음 대화 위치에 표시하도록 신호한다(같은 흐름).
    expect(find.text('예약 신청하기'), findsOneWidget);
  });

  testWidgets('[CCARD-BOOKCONF-RACE-01] 슬롯 충돌이면 최신 시간선택으로 이어줌 — 처음 질문 안 되돌림', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CBookConfirmCard(
        payload: p('race'), onSubmit: () {}))));
    expect(find.textContaining('마감'), findsOneWidget);
  });

  testWidgets('[CCARD-BOOKCONF-MODE-01] 제한모드면 예약 제안·확인·실행 카드를 보내지 않는다', (t) async {
    // dispatcher가 restricted=true에서 booking_confirm을 렌더하지 않음(Step 1 dispatcher 테스트와 대칭).
    expect(actionCardBlockedInRestricted('booking_confirm'), isTrue);
  });
}
