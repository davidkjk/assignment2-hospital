import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import 'package:hospital_patient_app/features/chat/chat_models.dart';
import 'package:hospital_patient_app/features/chat/chat_room_controller.dart';
import 'package:hospital_patient_app/features/chat/chat_room_view.dart';

// 상태를 직접 심는 가짜 컨트롤러 provider override.
Widget _scope(ChatRoomState st, {void Function()? onFeedback}) => ProviderScope(
    overrides: [chatRoomProvider(('t1', '')).overrideWith((ref) => _StubCtl(st))],
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

  testWidgets('[CHAT-ROOM-NAME-01] 앱바에 봇 아이콘이 항상 붙는다(로딩→방 전이 시 깜빡임 없음)', (t) async {
    // ChatRoomEntry 로딩/오류는 icon: chat_bubble을 주는데 방(ChatRoomView)이 안 주면 로드 순간
    // 아이콘이 사라져 깜빡였다 — 방도 같은 아이콘을 붙여 일관되게 한다.
    await t.pumpWidget(_scope(ChatRoomState(ChatRoomPhase.loaded, items: [bot('안녕')])));
    expect(find.byIcon(AppIcons.chat_bubble), findsOneWidget);
  });

  testWidgets('[NAV-CHATAPP-09] 딥링크 방(onExit)엔 이전 상담 목록으로 나가는 뒤로 버튼이 있다', (t) async {
    // 셸 밖 풀스크린 방은 탭바가 없어 onExit(뒤로가기→이전 상담 목록)가 유일한 출구다(막다른 길 금지).
    var exited = false;
    await t.pumpWidget(ProviderScope(
      overrides: [chatRoomProvider(('t1', '')).overrideWith((ref) => _StubCtl(
          ChatRoomState(ChatRoomPhase.loaded, items: [bot('안녕')])))],
      child: MaterialApp(
          home: ChatRoomView(threadId: 't1', onExit: () => exited = true)),
    ));
    await t.tap(find.byTooltip('이전 상담 목록'));
    expect(exited, isTrue);
  });

  testWidgets('[CHAT-ROOM-INPUT-01] 대화 영역을 탭하면 키보드가 내려간다(갇힘 방지)', (t) async {
    await t.pumpWidget(_scope(ChatRoomState(ChatRoomPhase.loaded, items: [bot('안녕')])));
    bool inputFocused() =>
        t.widget<EditableText>(find.byType(EditableText)).focusNode.hasFocus;
    await t.tap(find.byType(TextField)); // 입력창 포커스 → 키보드
    await t.pump();
    expect(inputFocused(), isTrue);
    await t.tap(find.textContaining('진단이 아니라')); // 안전 배너(버튼 아님)를 탭 = 빈 영역 탭
    await t.pump();
    expect(inputFocused(), isFalse); // 입력창 포커스 해제 → 키보드 내려감
  });

  testWidgets('[CHAT-ROOM-LIVE-TYPING-01] 직원 입력 중이면 입력창 위에 "직원이 입력 중입니다"를 표시', (t) async {
    await t.pumpWidget(_scope(ChatRoomState(ChatRoomPhase.loaded,
        items: [bot('안녕')], staffTyping: true)));
    await t.pump(); // 무한 애니메이션 — pumpAndSettle 금지(타임아웃)
    expect(find.text('직원이 입력 중입니다'), findsOneWidget);
  });

  testWidgets('[CHAT-ROOM-LIVE-TYPING-01] 직원이 입력 중이 아니면 표시하지 않는다(상시 노출 금지)', (t) async {
    await t.pumpWidget(_scope(ChatRoomState(ChatRoomPhase.loaded,
        items: [bot('안녕')], staffTyping: false)));
    await t.pump();
    expect(find.text('직원이 입력 중입니다'), findsNothing);
  });

  testWidgets('[CHAT-ROOM-BOT-TYPING-01] 봇 답변 대기 중이면 "상담봇이 입력 중"을 표시', (t) async {
    await t.pumpWidget(_scope(ChatRoomState(ChatRoomPhase.loaded,
        items: [bot('안녕')], botThinking: true)));
    await t.pump();
    expect(find.text('상담봇이 입력 중'), findsOneWidget);
  });

  testWidgets('[CHAT-ROOM-BOT-TYPING-01] 봇 대기가 직원 입력 중보다 우선(둘 다면 봇만)', (t) async {
    await t.pumpWidget(_scope(ChatRoomState(ChatRoomPhase.loaded,
        items: [bot('안녕')], botThinking: true, staffTyping: true)));
    await t.pump();
    expect(find.text('상담봇이 입력 중'), findsOneWidget);
    expect(find.text('직원이 입력 중입니다'), findsNothing);
  });

  testWidgets('[CHAT-ROOM-NEW-01] 상담방 상단에 [새 대화] 버튼이 상시 있다', (t) async {
    await t.pumpWidget(_scope(ChatRoomState(ChatRoomPhase.loaded, items: [bot('안녕')])));
    await t.pump();
    expect(find.byTooltip('새 대화'), findsOneWidget); // 언제든 새로 시작 가능(사용자 결정 B)
  });

  testWidgets('[CCARD-QUICK-START-01] 빈 상태 시작 칩은 입력창 위 고정 바가 아니라 대화 안내 밑에 있다', (t) async {
    await t.pumpWidget(_scope(const ChatRoomState(ChatRoomPhase.loaded, items: [])));
    await t.pump();
    expect(find.byKey(const Key('chat-empty-guide')), findsOneWidget);
    expect(find.text('진료시간이 어떻게 되나요'), findsOneWidget); // 정본 시작 칩이 대화창 안에 뜬다
  });

  testWidgets('[CHAT-ROOM-FEEDBACK-01] 피드백 버튼 문구는 중립적(이미 도움 안 된 느낌 금지)', (t) async {
    await t.pumpWidget(_scope(ChatRoomState(ChatRoomPhase.loaded, items: [bot('안녕')])));
    await t.pump();
    expect(find.text('도움이 안 됐어요'), findsNothing);
    expect(find.text('직원에게 물어보기'), findsWidgets); // 다음 갈 곳(직원 연결)으로 반전
  });

  testWidgets('[A4] 새 대화(현재 대화처럼)는 뒤로가기 없이 지난 상담 아이콘이 있다', (t) async {
    await t.pumpWidget(ProviderScope(
      overrides: [chatRoomProvider(('t1', '')).overrideWith((ref) => _StubCtl(
          ChatRoomState(ChatRoomPhase.loaded, items: [bot('안녕')])))],
      child: MaterialApp(home: ChatRoomView(threadId: 't1', showHistory: true)),
    ));
    await t.pump();
    expect(find.byTooltip('지난 상담'), findsOneWidget);     // 이력 아이콘 있음
    expect(find.byTooltip('이전 상담 목록'), findsNothing);  // 뒤로가기 버튼 없음
  });
}
