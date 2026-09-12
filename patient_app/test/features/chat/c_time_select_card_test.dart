import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/chat_models.dart';
import 'package:hospital_patient_app/features/chat/cards/chat_card_dispatcher.dart';
import 'package:hospital_patient_app/features/chat/cards/c_time_select_card.dart';

ChatFeedItem _card(String type, {Map<String, dynamic>? p}) => ChatFeedItem(
    id: 'c', messageType: 'card', senderType: 'bot', createdAt: DateTime(2026),
    payload: {'card_type': type, ...?p});

void main() {
  testWidgets('[CCARD-TIME-SHOW-01] time_select payload면 시간선택 카드를 피드 흐름에 삽입', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: Builder(
        builder: (ctx) => buildChatCard(ctx, _card('time_select',
            p: {'slots': [{'slot_id': 's1', 'label': '9/1 10:00'}]}))))));
    expect(find.byType(CTimeSelectCard), findsOneWidget);
  });

  testWidgets('[CCARD-TIME-LIST-01] 후보는 봇 대화문이 아니라 카드의 날짜·시간 버튼으로만', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CTimeSelectCard(
        payload: const {'state': 'normal', 'slots': [{'slot_id': 's1', 'label': '9/1 10:00'}]},
        onPick: (_) {}))));
    expect(find.widgetWithText(OutlinedButton, '9/1 10:00'), findsOneWidget); // 버튼
  });

  testWidgets('[CCARD-TIME-STATE-01] 5상태를 같은 카드 자리에서 전환 — 별도 전체화면/팝업 없음', (t) async {
    for (final s in ['normal', 'empty', 'loading', 'error', 'race']) {
      await t.pumpWidget(MaterialApp(home: Scaffold(body: CTimeSelectCard(
          payload: {'state': s, 'slots': const []}, onPick: (_) {}))));
      expect(find.byType(CTimeSelectCard), findsOneWidget); // 같은 위젯 자리
    }
  });

  testWidgets('[CCARD-TIME-RACE-01] 슬롯 충돌이면 소진 알림 + 최신 후보 재표시 — 처음부터 아님', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CTimeSelectCard(
        payload: const {'state': 'race', 'slots': [{'slot_id': 's2', 'label': '9/1 11:00'}]},
        onPick: (_) {}))));
    expect(find.textContaining('마감'), findsOneWidget);              // 소진 알림
    expect(find.widgetWithText(OutlinedButton, '9/1 11:00'), findsOneWidget); // 최신 후보
  });

  testWidgets('[CCARD-TIME-MODE-01] BOOKBOT-SHEET 모드면 시간선택 카드를 보내지 않는다', (t) async {
    // 제한모드에서는 dispatcher가 time_select를 렌더하지 않는다(행동형 카드 차단).
    await t.pumpWidget(MaterialApp(home: Scaffold(body: Builder(
        builder: (ctx) => buildChatCard(ctx, _card('time_select'), restricted: true)))));
    expect(find.byType(CTimeSelectCard), findsNothing);
  });
}
