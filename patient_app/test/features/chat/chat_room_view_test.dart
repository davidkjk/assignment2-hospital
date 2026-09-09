import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import 'package:hospital_patient_app/features/chat/chat_models.dart';
import 'package:hospital_patient_app/features/chat/chat_repository.dart';
import 'package:hospital_patient_app/features/chat/chat_room_controller.dart';
import 'package:hospital_patient_app/features/chat/chat_room_view.dart';
import 'package:hospital_patient_app/features/chat/widgets/chat_typing_indicator.dart';
import 'package:hospital_patient_app/features/chat/widgets/chat_handoff_badge.dart';
import 'package:hospital_patient_app/features/chat/widgets/chat_end_boundary.dart';

// 상태를 직접 심는 가짜 컨트롤러 provider override.
Widget _scope(ChatRoomState st, {void Function()? onFeedback}) => ProviderScope(
    overrides: [chatRoomProvider(('t1', '')).overrideWith((ref) => _StubCtl(st))],
    child: MaterialApp(home: ChatRoomView(threadId: 't1', onFeedback: onFeedback)));

class _StubCtl extends StateNotifier<ChatRoomState> implements ChatRoomController {
  _StubCtl(super.s);
  @override
  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

// [새 대화]가 부르는 startFreshSession만 새 방(t2)으로 답하는 가짜 저장소.
class _FreshRepo extends ChatRepository {
  _FreshRepo()
      : super(ApiClient(
            baseUrl: 'http://x',
            tokenProvider: () async => 't',
            httpClient: MockClient((_) async => http.Response('{}', 200))));
  @override
  Future<ChatSessionRef> startFreshSession() async =>
      const ChatSessionRef(threadId: 't2', aiSessionId: 'a2');
}

// 종료 경계의 두 분기가 실제로 어느 세션 생성 경로를 부르는지 기록하는 가짜 저장소.
class _EndRepo extends ChatRepository {
  _EndRepo()
      : super(ApiClient(
            baseUrl: 'http://x',
            tokenProvider: () async => 't',
            httpClient: MockClient((_) async => http.Response('{}', 200))));
  bool freshCalled = false;
  String? resumedFrom;
  @override
  Future<ChatSessionRef> startFreshSession() async {
    freshCalled = true;
    return const ChatSessionRef(threadId: 't2', aiSessionId: 'a2');
  }

  @override
  Future<ChatSessionRef> resumeWithSummary(String threadId) async {
    resumedFrom = threadId;
    return const ChatSessionRef(threadId: 't3', aiSessionId: 'a3');
  }
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

  testWidgets('[Q5] 마지막이 봇 답변이면 상시 버튼 대신 입력창 슬롯 [직원에게 연결] 칩을 띄운다', (t) async {
    await t.pumpWidget(_scope(
        ChatRoomState(ChatRoomPhase.loaded, items: [bot('안녕하세요, 이렇게 안내드려요')])));
    await t.pump();
    expect(find.byKey(const Key('chat-feedback-btn')), findsNothing); // 매 말풍선 상시 버튼 폐지
    expect(find.text('직원에게 연결하기'), findsOneWidget);                 // 필요 시 콜백 칩(막다른 길 금지)
  });

  testWidgets('[WEBCHAT-NOANS] 마지막 줄이 quick_replies 카드면 입력창 슬롯에 FAQ+[직원에게 연결] 칩을 띄운다', (t) async {
    final card = ChatFeedItem(
        id: 'c', messageType: 'card', senderType: 'bot', createdAt: DateTime(2026),
        payload: const {'card_type': 'quick_replies', 'options': ['진료시간이 어떻게 되나요'], 'handoff_chip': '직원에게 연결하기'});
    await t.pumpWidget(_scope(ChatRoomState(ChatRoomPhase.loaded, items: [bot('바로 답을 못 찾았어요'), card])));
    expect(find.text('진료시간이 어떻게 되나요'), findsOneWidget); // 입력 슬롯 FAQ 칩(카드는 피드에서 SizedBox)
    expect(find.text('직원에게 연결하기'), findsOneWidget);          // 콜백 칩
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

  // Q7: 입력 중 표시는 입력바 위 텍스트가 아니라 **피드 안 봇 말풍선 자리의 점 말풍선**(ChatTypingBubble).
  // 문구는 화면에 글자로 그리지 않고 접근성 라벨(label)로만 둔다(정본 webchat aria-label).
  ChatTypingBubble typingBubble(WidgetTester t) =>
      t.widget<ChatTypingBubble>(find.byType(ChatTypingBubble));

  testWidgets('[CHAT-ROOM-LIVE-TYPING-01·Q7] 직원 입력 중이면 피드 안 점 말풍선(라벨=직원이 입력 중입니다)', (t) async {
    await t.pumpWidget(_scope(ChatRoomState(ChatRoomPhase.loaded,
        items: [bot('안녕')], staffTyping: true)));
    await t.pump(); // 무한 애니메이션 — pumpAndSettle 금지(타임아웃)
    expect(find.byType(ChatTypingBubble), findsOneWidget);
    expect(typingBubble(t).label, '직원이 입력 중입니다');
    expect(find.text('직원이 입력 중입니다'), findsNothing); // 화면 글자 아님(a11y 라벨)
  });

  testWidgets('[CHAT-ROOM-LIVE-TYPING-01·Q7] 직원이 입력 중이 아니면 점 말풍선 없음(상시 노출 금지)', (t) async {
    await t.pumpWidget(_scope(ChatRoomState(ChatRoomPhase.loaded,
        items: [bot('안녕')], staffTyping: false)));
    await t.pump();
    expect(find.byType(ChatTypingBubble), findsNothing);
  });

  testWidgets('[CHAT-ROOM-BOT-TYPING-01·Q7] 봇 답변 대기 중이면 점 말풍선(라벨=상담봇이 입력 중)', (t) async {
    await t.pumpWidget(_scope(ChatRoomState(ChatRoomPhase.loaded,
        items: [bot('안녕')], botThinking: true)));
    await t.pump();
    expect(find.byType(ChatTypingBubble), findsOneWidget);
    expect(typingBubble(t).label, '상담봇이 입력 중');
  });

  testWidgets('[CHAT-ROOM-BOT-TYPING-01·Q7] 봇 대기가 직원 입력 중보다 우선(둘 다면 봇 라벨만)', (t) async {
    await t.pumpWidget(_scope(ChatRoomState(ChatRoomPhase.loaded,
        items: [bot('안녕')], botThinking: true, staffTyping: true)));
    await t.pump();
    expect(find.byType(ChatTypingBubble), findsOneWidget);
    expect(typingBubble(t).label, '상담봇이 입력 중');
  });

  testWidgets('[Q18/#9] 인계되면 피드 배지(안내 멘트) + 헤더 상태(직원 확인 전)가 함께 뜬다', (t) async {
    await t.pumpWidget(_scope(ChatRoomState(ChatRoomPhase.loaded, items: [bot('안녕')],
        handoff: const HandoffStatus(phase: HandoffPhase.connecting))));
    await t.pump();
    expect(find.byType(ChatHandoffBadge), findsOneWidget);
    expect(find.byType(ChatHandoffHeaderStatus), findsOneWidget);
    expect(find.text('직원 확인 전'), findsOneWidget); // 헤더의 짧은 라벨
  });

  testWidgets('[Q18③/#9] 직원 열람 presence면 헤더가 `직원 확인 중`으로 바뀐다', (t) async {
    await t.pumpWidget(_scope(ChatRoomState(ChatRoomPhase.loaded, items: [bot('안녕')],
        handoff: const HandoffStatus(phase: HandoffPhase.connecting), staffViewing: true)));
    await t.pump();
    expect(find.text('직원 확인 중'), findsOneWidget);
  });

  testWidgets('[Q18] 인계 전(handoff 없음)이면 상태 배지를 그리지 않는다', (t) async {
    await t.pumpWidget(_scope(ChatRoomState(ChatRoomPhase.loaded, items: [bot('안녕')])));
    await t.pump();
    expect(find.byType(ChatHandoffBadge), findsNothing);
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

  testWidgets('[Q5] 매 봇 말풍선의 상시 [직원에게 물어보기] 버튼은 폐지 — 필요 시 [직원에게 연결] 칩만', (t) async {
    await t.pumpWidget(_scope(ChatRoomState(ChatRoomPhase.loaded, items: [bot('안녕')])));
    await t.pump();
    expect(find.text('도움이 안 됐어요'), findsNothing);
    expect(find.text('직원에게 물어보기'), findsNothing); // 상시 버튼 폐지(반복돼 "이미 도움 안 됨" 느낌)
    expect(find.text('직원에게 연결하기'), findsOneWidget);   // 대체: 최근 봇 답변에 콜백 칩
  });

  testWidgets('[Q1·Q2] 새 대화는 방을 스택에 쌓지 않고 상담 탭(/chat)으로 이동한다', (t) async {
    // 실기기 지적: [새 대화]를 누를 때마다 카드 위에 카드가 쌓이고(뒤로가기 생김),
    // 탭을 다시 눌러도 옛 대화로 감. 원인=push('/chat/room/:id')로 스택에 쌓고 탭(/chat)을
    // 갱신하지 않음. 고침=go('/chat')로 스택 없이 탭으로 이동(+ 탭 세션 provider 무효화).
    final router = GoRouter(
      initialLocation: '/chat/room/t1',
      routes: [
        GoRoute(path: '/chat', builder: (c, s) => const Text('CHAT_TAB_MARKER')),
        GoRoute(
            path: '/chat/room/:id',
            builder: (c, s) => ChatRoomView(threadId: s.pathParameters['id']!)),
      ],
    );
    await t.pumpWidget(ProviderScope(
      overrides: [
        chatRepositoryProvider.overrideWithValue(_FreshRepo()),
        chatRoomProvider(('t1', '')).overrideWith((ref) =>
            _StubCtl(ChatRoomState(ChatRoomPhase.loaded, items: [bot('안녕')]))),
        // 옛 코드가 push하면 열릴 새 방(t2)도 스텁 — RED가 깔끔히 실패하도록.
        chatRoomProvider(('t2', '')).overrideWith((ref) =>
            _StubCtl(ChatRoomState(ChatRoomPhase.loaded, items: [bot('새 방')]))),
      ],
      child: MaterialApp.router(routerConfig: router),
    ));
    await t.pump();
    await t.tap(find.byTooltip('새 대화'));
    await t.pumpAndSettle();
    expect(find.text('CHAT_TAB_MARKER'), findsOneWidget); // 탭으로 이동(Q2)
    expect(find.byType(ChatRoomView), findsNothing); // 방이 스택에 안 쌓임(Q1)
  });

  // ── 라이브 상담 완성 #1: 직원 상담 종료 → 막다른 길 방지 ─────────────────────
  ChatRoomState closedState() => ChatRoomState(ChatRoomPhase.loaded,
      items: [bot('다른 질문이 없으시면 상담을 마치겠습니다')],
      handoff: const HandoffStatus(phase: HandoffPhase.ended, closed: true));

  testWidgets('[CHAT-ROOM-END-01] 직원이 상담 종료하면 입력창 대신 종료 경계를 띄운다(막다른 길 방지)',
      (t) async {
    await t.pumpWidget(_scope(closedState()));
    await t.pump();
    expect(find.byType(ChatEndBoundary), findsOneWidget);
    expect(find.byType(TextField), findsNothing); // 죽은 방(AI ended)에 입력하면 503 — 입력창을 감춘다
    expect(find.text('직원에게 연결하기'), findsNothing); // 종료 뒤엔 인계 칩도 없음(재인계 아님)
  });

  testWidgets('[CHAT-ROOM-END-01] 종료가 아니면(답변 도착) 입력창은 그대로 열려 있다', (t) async {
    // closed=false(답변 도착)면 대화가 계속 가능해야 한다 — 종료 경계·입력창 감춤은 종료일 때만.
    await t.pumpWidget(_scope(ChatRoomState(ChatRoomPhase.loaded, items: [bot('네 도와드릴게요')],
        handoff: const HandoffStatus(phase: HandoffPhase.ended, closed: false))));
    await t.pump();
    expect(find.byType(ChatEndBoundary), findsNothing);
    expect(find.byType(TextField), findsOneWidget);
  });

  testWidgets('[CHAT-ROOM-END-NAV-01] [새 질문]은 새 세션으로 시작하고 상담 탭으로 이동', (t) async {
    final repo = _EndRepo();
    final router = GoRouter(initialLocation: '/chat/room/t1', routes: [
      GoRoute(path: '/chat', builder: (c, s) => const Text('CHAT_TAB_MARKER')),
      GoRoute(
          path: '/chat/room/:id',
          builder: (c, s) => ChatRoomView(threadId: s.pathParameters['id']!)),
    ]);
    await t.pumpWidget(ProviderScope(
      overrides: [
        chatRepositoryProvider.overrideWithValue(repo),
        chatRoomProvider(('t1', '')).overrideWith((ref) => _StubCtl(closedState())),
      ],
      child: MaterialApp.router(routerConfig: router),
    ));
    await t.pump();
    await t.tap(find.text('새 질문'));
    await t.pumpAndSettle();
    expect(repo.freshCalled, isTrue); // 과거 문맥 없는 새 AI 상담
    expect(repo.resumedFrom, isNull); // 요약 이어가기는 부르지 않음
    expect(find.text('CHAT_TAB_MARKER'), findsOneWidget); // 탭으로 이동(스택 안 쌓음)
  });

  testWidgets('[CHAT-ROOM-END-NAV-01] [이어서 AI 질문]은 직전 상담(t1) 요약을 가진 새 AI 상담을 연다', (t) async {
    final repo = _EndRepo();
    final router = GoRouter(initialLocation: '/chat/room/t1', routes: [
      GoRoute(path: '/chat', builder: (c, s) => const Text('CHAT_TAB_MARKER')),
      GoRoute(
          path: '/chat/room/:id',
          builder: (c, s) => ChatRoomView(threadId: s.pathParameters['id']!)),
    ]);
    await t.pumpWidget(ProviderScope(
      overrides: [
        chatRepositoryProvider.overrideWithValue(repo),
        chatRoomProvider(('t1', '')).overrideWith((ref) => _StubCtl(closedState())),
      ],
      child: MaterialApp.router(routerConfig: router),
    ));
    await t.pump();
    await t.tap(find.text('이어서 AI 질문'));
    await t.pumpAndSettle();
    expect(repo.resumedFrom, 't1'); // 직전 직원 상담 요약(resume_from=현재 thread)
    expect(repo.freshCalled, isFalse);
    expect(find.text('CHAT_TAB_MARKER'), findsOneWidget);
  });

  testWidgets('[A4] 새 대화(현재 대화처럼)는 뒤로가기 없이 지난 상담 아이콘이 있다', (t) async {
    await t.pumpWidget(ProviderScope(
      overrides: [chatRoomProvider(('t1', '')).overrideWith((ref) => _StubCtl(
          ChatRoomState(ChatRoomPhase.loaded, items: [bot('안녕')])))],
      child: const MaterialApp(
          home: ChatRoomView(threadId: 't1', showHistory: true)),
    ));
    await t.pump();
    expect(find.byTooltip('지난 상담'), findsOneWidget);     // 이력 아이콘 있음
    expect(find.byTooltip('이전 상담 목록'), findsNothing);  // 뒤로가기 버튼 없음
  });
}
