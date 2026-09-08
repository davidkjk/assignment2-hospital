import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/chat_models.dart';
import 'package:hospital_patient_app/features/chat/widgets/chat_feed.dart';

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
}
