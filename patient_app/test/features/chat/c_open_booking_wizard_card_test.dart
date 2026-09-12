import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/chat_models.dart';
import 'package:hospital_patient_app/features/chat/cards/chat_card_dispatcher.dart';

// 결정 B(2026-09-07): 앱 AI 상담은 대화 내 예약 대신 예약 마법사로 인계 → open_booking_wizard 카드.
ChatFeedItem _card(Map<String, dynamic> p) => ChatFeedItem(
    id: 'c', messageType: 'card', senderType: 'bot', createdAt: DateTime(2026),
    payload: {'card_type': 'open_booking_wizard', ...p});

Widget _wrap(Widget child) =>
    MaterialApp(home: Scaffold(body: Builder(builder: (ctx) => child)));

void main() {
  testWidgets('[결정B] open_booking_wizard = [예약하러 가기] 버튼 + 추천 진료과 표시', (t) async {
    await t.pumpWidget(_wrap(Builder(
        builder: (ctx) =>
            buildChatCard(ctx, _card({'department_id': 'd1', 'department_name': '내과'})))));
    expect(find.widgetWithText(FilledButton, '예약하러 가기'), findsOneWidget);
    expect(find.textContaining('내과'), findsOneWidget); // 추천 진료과를 함께 보여준다
  });

  testWidgets('[결정B] 추천 진료과가 없어도 [예약하러 가기]는 있다(일반 예약 의도)', (t) async {
    await t.pumpWidget(
        _wrap(Builder(builder: (ctx) => buildChatCard(ctx, _card(const {})))));
    expect(find.widgetWithText(FilledButton, '예약하러 가기'), findsOneWidget);
    expect(find.textContaining('추천 진료과'), findsNothing);
  });
}
