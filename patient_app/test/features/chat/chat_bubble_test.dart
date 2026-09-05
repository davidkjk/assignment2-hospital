import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/chat_models.dart';
import 'package:hospital_patient_app/features/chat/widgets/chat_bubble.dart';

void main() {
  Future<void> pump(WidgetTester t, ChatFeedItem item) => t.pumpWidget(
      MaterialApp(home: Scaffold(body: ChatBubble(item: item))));

  testWidgets('[CHAT-ROOM-NAME-01] 봇 발신자 이름은 AI 상담봇', (t) async {
    await pump(
        t,
        ChatFeedItem(
            id: 'm',
            messageType: 'text',
            senderType: 'bot',
            content: '안녕하세요',
            createdAt: DateTime(2026)));
    expect(find.text('AI 상담봇'), findsOneWidget);
  });

  testWidgets('[CHAT-ROOM-VISUAL-01] 의료 안내는 `진료 안내`, 일반은 `병원 이용 안내` 머리말', (t) async {
    await pump(
        t,
        ChatFeedItem(
            id: 'm',
            messageType: 'text',
            senderType: 'bot',
            content: '내과를 추천합니다',
            createdAt: DateTime(2026),
            payload: const {'notice_kind': 'medical'}));
    expect(find.text('진료 안내'), findsOneWidget);
    await pump(
        t,
        ChatFeedItem(
            id: 'm',
            messageType: 'text',
            senderType: 'bot',
            content: '주차는 지하 1층',
            createdAt: DateTime(2026),
            payload: const {'notice_kind': 'general'}));
    expect(find.text('병원 이용 안내'), findsOneWidget);
  });

  testWidgets('[CHAT-ROOM-SEND-02] 전송 실패 말풍선엔 원문과 [재전송]이 함께 있다', (t) async {
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: ChatBubble(
                item: ChatFeedItem(
                    id: 'm',
                    messageType: 'text',
                    senderType: 'patient',
                    content: '안녕',
                    createdAt: DateTime(2026),
                    sendState: ChatSendState.failed),
                onRetry: () {}))));
    expect(find.text('안녕'), findsOneWidget); // 원문 보존
    expect(find.text('재전송'), findsOneWidget);
  });

  testWidgets('[CHAT-ROOM-EXC-01] unknown 아이템은 시각을 지어내지 않고 확인 필요로 표시', (t) async {
    await pump(
        t,
        const ChatFeedItem(
            id: 'm',
            messageType: 'text',
            senderType: null,
            content: '?',
            createdAt: null));
    expect(find.textContaining('확인'), findsOneWidget); // 임의 시각/발신자 없음
  });
}
