import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/chat_models.dart';
import 'package:hospital_patient_app/features/chat/widgets/chat_feed.dart';
import 'package:hospital_patient_app/features/chat/widgets/chat_typing_indicator.dart';

// 발신자별 좌우 정렬(CHAT-ROOM-FEED-01). 예전엔 피드가 모든 말풍선을 Column(start)로 놓고
// ChatBubble 내부 end 정렬은 열이 내용폭으로 줄어 무효라, 내 메시지도 왼쪽에 붙었다.
void main() {
  ChatFeedItem _msg(String id, String sender) => ChatFeedItem(
      id: id, messageType: 'text', senderType: sender, content: '$sender 메시지',
      createdAt: DateTime(2026, 1, 1, 10));

  testWidgets('[CHAT-ROOM-FEED-01] 내 메시지는 오른쪽, 상대(봇·직원)는 왼쪽 정렬', (t) async {
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: ChatFeed(items: [
          _msg('p1', 'patient'),
          _msg('b1', 'bot'),
          _msg('s1', 'staff'),
        ]),
      ),
    ));
    final p = t.widget<Align>(find.byKey(const ValueKey('msg-align-p1')));
    final b = t.widget<Align>(find.byKey(const ValueKey('msg-align-b1')));
    final s = t.widget<Align>(find.byKey(const ValueKey('msg-align-s1')));
    expect(p.alignment, Alignment.centerRight); // 내 메시지 = 오른쪽
    expect(b.alignment, Alignment.centerLeft); // 봇 = 왼쪽
    expect(s.alignment, Alignment.centerLeft); // 직원 = 왼쪽
  });

  testWidgets('[Q20] 본문이 빈 봇 메시지는 빈 말풍선·피드백 버튼을 그리지 않는다', (t) async {
    final blank = ChatFeedItem(
        id: 'b-empty', messageType: 'text', senderType: 'bot', content: '   ',
        createdAt: DateTime(2026, 1, 1, 10));
    await t.pumpWidget(MaterialApp(
      home: Scaffold(body: ChatFeed(items: [_msg('p1', 'patient'), blank])),
    ));
    expect(find.byKey(const ValueKey('msg-align-b-empty')), findsNothing); // 빈 알약 없음
    expect(find.byKey(const Key('chat-feedback-btn')), findsNothing); // 고아 피드백 버튼 없음
    expect(find.byKey(const ValueKey('msg-align-p1')), findsOneWidget); // 정상 메시지는 유지
  });

  testWidgets('[Q20] 본문이 있는 봇 메시지는 정상 렌더(가드 오작동 아님)', (t) async {
    await t.pumpWidget(MaterialApp(
      home: Scaffold(body: ChatFeed(items: [_msg('b1', 'bot')])),
    ));
    expect(find.byKey(const ValueKey('msg-align-b1')), findsOneWidget);
    expect(find.text('bot 메시지'), findsOneWidget);
  });

  testWidgets('[Q7] typingLabel이 있으면 피드 마지막에 점 말풍선(ChatTypingBubble)을 붙인다', (t) async {
    await t.pumpWidget(MaterialApp(
        home: Scaffold(body: ChatFeed(items: [_msg('b1', 'bot')], typingLabel: '상담봇이 입력 중'))));
    await t.pump(); // 무한 애니메이션 — pumpAndSettle 금지
    expect(find.byType(ChatTypingBubble), findsOneWidget);
  });

  testWidgets('[Q7] typingLabel이 없으면 점 말풍선을 붙이지 않는다', (t) async {
    await t.pumpWidget(MaterialApp(
        home: Scaffold(body: ChatFeed(items: [_msg('b1', 'bot')]))));
    await t.pump();
    expect(find.byType(ChatTypingBubble), findsNothing);
  });
}
