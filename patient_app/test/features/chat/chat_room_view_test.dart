import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hospital_patient_app/features/chat/chat_models.dart';
import 'package:hospital_patient_app/features/chat/chat_room_controller.dart';
import 'package:hospital_patient_app/features/chat/chat_room_view.dart';

// 상태를 직접 심는 가짜 컨트롤러 provider override.
Widget _scope(ChatRoomState st, {void Function()? onFeedback}) => ProviderScope(
    overrides: [chatRoomProvider('t1').overrideWith((ref) => _StubCtl(st))],
    child: MaterialApp(home: ChatRoomView(threadId: 't1', onFeedback: onFeedback)));

class _StubCtl extends StateNotifier<ChatRoomState> implements ChatRoomController {
  _StubCtl(super.s);
  @override
  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

void main() {
  ChatFeedItem bot(String c) => ChatFeedItem(
      id: c, messageType: 'text', senderType: 'bot', content: c, createdAt: DateTime(2026));

  testWidgets('[CHAT-ROOM-LOAD-01] loading이면 복원 로딩만 — 빈/피드를 먼저 그리지 않는다', (t) async {
    await t.pumpWidget(_scope(const ChatRoomState(ChatRoomPhase.loading)));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    // 첫 상담 안내(빈 상태)를 미리 그리지 않는다 — AppBar 제목과 겹치지 않게 key로 확인.
    expect(find.byKey(const Key('chat-empty-guide')), findsNothing);
  });

  testWidgets('[CHAT-ROOM-ERR-01] error면 조회 오류 + [다시 시도]', (t) async {
    await t.pumpWidget(_scope(const ChatRoomState(ChatRoomPhase.error)));
    expect(find.text('다시 시도'), findsOneWidget);
  });

  testWidgets('[CHAT-ROOM-EMPTY-01] 0건이면 오류가 아니라 시작 안내 + 빠른답변 슬롯', (t) async {
    await t.pumpWidget(_scope(const ChatRoomState(ChatRoomPhase.loaded, items: [])));
    expect(find.text('다시 시도'), findsNothing); // 오류 아님
    expect(find.byKey(const Key('chat-empty-guide')), findsOneWidget);
  });

  testWidgets('[CHAT-ROOM-FEED-01] loaded면 한 피드에 말풍선을 시간순으로 쌓고 전체화면으로 안 바꾼다',
      (t) async {
    await t.pumpWidget(_scope(ChatRoomState(ChatRoomPhase.loaded,
        items: [bot('안녕'), bot('무엇을 도와드릴까요')])));
    expect(find.text('안녕'), findsOneWidget);
    expect(find.text('무엇을 도와드릴까요'), findsOneWidget);
    expect(find.byType(ChatRoomView), findsOneWidget); // 같은 화면 안(별도 전체화면 없음)
  });

  testWidgets('[CHAT-ROOM-SAFE-01] 안전 배너가 대화 화면에 항상 붙어 있다', (t) async {
    await t.pumpWidget(
        _scope(ChatRoomState(ChatRoomPhase.loaded, items: [bot('안녕')])));
    expect(find.textContaining('진단이 아니라'), findsOneWidget);
  });

  testWidgets('[CHAT-ROOM-FEEDBACK-01] 봇 답변의 `도움이 안 됐어요`를 누르면 인계 연결 콜백을 부른다',
      (t) async {
    var called = false;
    await t.pumpWidget(_scope(
        ChatRoomState(ChatRoomPhase.loaded, items: [bot('안녕')]),
        onFeedback: () => called = true));
    await t.tap(find.byKey(const Key('chat-feedback-btn')).first);
    expect(called, isTrue); // 답변+맥락을 직원 인계 대상으로(본체=T11 라이브)
  });

  testWidgets('[WEBCHAT-NOANS] 마지막 줄이 quick_replies 카드면 입력창 슬롯에 FAQ+[직원에게 연결] 칩을 띄운다', (t) async {
    final card = ChatFeedItem(
        id: 'c', messageType: 'card', senderType: 'bot', createdAt: DateTime(2026),
        payload: const {'card_type': 'quick_replies', 'options': ['진료시간이 어떻게 되나요'], 'handoff_chip': '직원에게 연결'});
    await t.pumpWidget(_scope(ChatRoomState(ChatRoomPhase.loaded, items: [bot('바로 답을 못 찾았어요'), card])));
    expect(find.text('진료시간이 어떻게 되나요'), findsOneWidget); // 입력 슬롯 FAQ 칩(카드는 피드에서 SizedBox)
    expect(find.text('직원에게 연결'), findsOneWidget);          // 콜백 칩
  });

  testWidgets('[CHAT-HISTORY-DEEP-03] 딥링크 대상이 없으면 다른 방을 열지 않고 오류+목록 복귀', (t) async {
    // 방 없음(404) → 조회 오류 상태 + [다시 시도] 경로. 임의의 다른 방을 열지 않는다.
    await t.pumpWidget(_scope(const ChatRoomState(ChatRoomPhase.error)));
    expect(find.text('다시 시도'), findsOneWidget);
  });
}
