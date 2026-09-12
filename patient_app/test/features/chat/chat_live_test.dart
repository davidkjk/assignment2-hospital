import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/chat_models.dart';
import 'package:hospital_patient_app/features/chat/widgets/chat_live_row.dart';

void main() {
  testWidgets('[CHAT-ROOM-LIVE-01] 직원 메시지도 새 방이 아니라 같은 피드 아이템으로 쌓인다', (t) async {
    final staff = ChatFeedItem(id: 's1', messageType: 'text', senderType: 'staff',
        content: '안녕하세요, 담당 간호사입니다', createdAt: DateTime(2026));
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatLiveRow(item: staff))));
    expect(find.textContaining('담당 간호사'), findsOneWidget); // 별도 방 없이 피드 안
  });

  testWidgets('[CHAT-ROOM-LIVE-STATE-01] 라이브 상태는 연결중→상담중→종료 순서로만 표시', (t) async {
    expect(handoffPhaseFromTicket('pending'), HandoffPhase.connecting);
    expect(handoffPhaseFromTicket('in_progress'), HandoffPhase.inProgress);
    expect(handoffPhaseFromTicket('answered'), HandoffPhase.ended);
    // 일반 메시지 전송(상태 없음)은 종료를 만들지 않는다 — 매핑에 없음.
    expect(handoffPhaseFromTicket('text'), isNull);
  });

  testWidgets('[CHAT-ROOM-LIVE-TYPING-01] 직원 입력 중이면 `직원이 입력 중입니다` 일시 표시 — 온라인 점/보장 아님', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: ChatTypingRow(typing: true))));
    expect(find.text('직원이 입력 중입니다'), findsOneWidget);
    expect(find.byKey(const Key('online-dot')), findsNothing); // 온라인 초록점 없음
  });

  testWidgets('[CHAT-ROOM-LIVE-CONN-01] 연결 불안정이면 원문 보존 + 재연결 상태 표시', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: ChatConnBanner(unstable: true))));
    expect(find.textContaining('연결'), findsOneWidget);   // 재연결 중 안내
    // 환자 메시지 실패·재전송은 CHAT-ROOM-SEND-02·03(T10)을 그대로 적용 — 여기서 새로 안 만든다.
  });
}
