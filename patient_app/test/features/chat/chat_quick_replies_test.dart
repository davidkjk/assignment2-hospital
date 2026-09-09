import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/chat_models.dart';
import 'package:hospital_patient_app/features/chat/widgets/chat_quick_replies.dart';

ChatFeedItem _card() => ChatFeedItem(
    id: '2', messageType: 'card', senderType: 'bot', createdAt: DateTime(2026),
    payload: const {'card_type': 'quick_replies', 'options': ['진료시간이 어떻게 되나요'], 'handoff_chip': '직원에게 연결하기'});

void main() {
  testWidgets('[CCARD-QUICK-START-01] 시작 묶음은 다가오는 예약 유무로 고정 4개 — AI 호출 없음', (t) async {
    final r = startQuickReplies(hasUpcoming: true);
    expect(r.length, 4);
    final r2 = startQuickReplies(hasUpcoming: false);
    expect(r2.length, 4);
    expect(r2, isNot(r)); // 유무에 따라 다른 고정 묶음
  });

  test('[CCARD-QUICK-START-01] 시작 칩은 정본 §8·백엔드 quick_replies.py와 글자까지 동일(파편 금지)', () {
    // 예전 `증상 상담`·`병원 위치·시간` 같은 파편은 handoff로 빠져 눌러도 무응답이었다(실기기 확증).
    // 구체적 질문문이라야 rag/department_guide/agent로 깨끗이 응답한다.
    expect(startQuickReplies(hasUpcoming: false),
        ['진료시간이 어떻게 되나요', '어느 과에 가야 할지 모르겠어요', '예약하려면 어떻게 하나요', '주차할 수 있나요']);
    expect(startQuickReplies(hasUpcoming: true),
        ['내 예약 확인해줘', '예약을 바꾸고 싶어요', '진료 전에 준비할 게 있나요', '주차할 수 있나요']);
  });

  testWidgets('[CCARD-QUICK-SEND-01] 버튼을 누르면 그 문장을 환자 말풍선으로 전송', (t) async {
    String? sent;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatQuickReplies(
        replies: const ['예약 확인하고 싶어요'], onSend: (s) => sent = s))));
    await t.tap(find.text('예약 확인하고 싶어요'));
    expect(sent, '예약 확인하고 싶어요');
  });

  testWidgets('[CCARD-QUICK-INPUT-01] 버튼 묶음과 함께 자유 입력이 계속 허용됨', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatQuickReplies(
        replies: const ['a', 'b'], onSend: (_) {}, freeInputOpen: true))));
    // 자유 입력은 입력창(T10 ChatInputBar)이 담당 — 빠른답변이 이를 막지 않음을 플래그로 표현.
    expect(find.text('a'), findsOneWidget);
  });

  testWidgets('[CCARD-QUICK-LOAD-01] 대화 중 생성 대기엔 스켈레톤/생성중 표시 없음 — 자유 입력만 유지', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatQuickReplies(
        replies: const [], onSend: (_) {}, generating: true))));
    expect(find.textContaining('추천 준비'), findsNothing); // 생성중 표시 안 함
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });

  testWidgets('[CCARD-QUICK-ERR-01] 생성 실패면 실패/재시도 버튼 없이 자유 입력만 — 상담 오류로 확대 안 함', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatQuickReplies(
        replies: const [], onSend: (_) {}, generateFailed: true))));
    expect(find.text('다시 시도'), findsNothing);
    expect(find.textContaining('오류'), findsNothing);
  });

  testWidgets('[CCARD-QUICK-MID-01] 대화 중 묶음은 3~4개를 표시(생성은 서버)', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatQuickReplies(
        replies: const ['a', 'b', 'c'], onSend: (_) {}))));
    expect(find.byType(ActionChip), findsNWidgets(3));
  });

  testWidgets('[WEBCHAT-NOANS] handoffLabel이 있으면 구분되는 [직원에게 연결] 칩 — 누르면 onHandoff(전송 아님)', (t) async {
    String? sent;
    var handoff = 0;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatQuickReplies(
        replies: const ['진료시간이 어떻게 되나요'], onSend: (s) => sent = s,
        handoffLabel: '직원에게 연결하기', onHandoff: () => handoff++))));
    expect(find.text('직원에게 연결하기'), findsOneWidget);
    await t.tap(find.text('직원에게 연결하기'));
    expect(handoff, 1);
    expect(sent, isNull); // 콜백 칩 — 문장 전송(onSend) 아님
  });

  testWidgets('[WEBCARD-QUICK] handoffLabel이 없으면 인계 칩을 렌더하지 않음(시작 칩 등)', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatQuickReplies(
        replies: const ['a'], onSend: (_) {}))));
    expect(find.text('직원에게 연결하기'), findsNothing);
  });

  test('[WEBCHAT-NOANS] activeQuickReplies는 마지막 quick_replies 카드의 옵션·handoff를 준다', () {
    final a = activeQuickReplies([
      ChatFeedItem(id: '1', messageType: 'text', senderType: 'bot', content: '바로 답을 못 찾았어요', createdAt: DateTime(2026)),
      _card(),
    ]);
    expect(a!.replies, ['진료시간이 어떻게 되나요']);
    expect(a.handoffLabel, '직원에게 연결하기');
  });

  test('[WEBCHAT-NOANS] 마지막 줄이 환자 발화면 null(봇 대기 중 — 칩이 사라진다)', () {
    final items = [
      _card(),
      ChatFeedItem(id: '3', messageType: 'text', senderType: 'patient', content: '진료시간이 어떻게 되나요', createdAt: DateTime(2026)),
    ];
    expect(activeQuickReplies(items), isNull);
  });

  test('[Q5] 마지막이 봇 답변이면 상시 버튼 대신 [직원에게 연결] 칩만(FAQ 옵션 없음)', () {
    final a = activeQuickReplies([
      ChatFeedItem(id: 'p', messageType: 'text', senderType: 'patient', content: '질문', createdAt: DateTime(2026)),
      ChatFeedItem(id: 'b', messageType: 'text', senderType: 'bot', content: '이렇게 안내드려요', createdAt: DateTime(2026)),
    ]);
    expect(a!.replies, isEmpty);
    expect(a.handoffLabel, '직원에게 연결하기');
  });

  test('[Q11] 마지막이 무답변 안내(봇)여도 [직원에게 연결] 칩이 실제로 뜬다(막다른 길 금지)', () {
    final a = activeQuickReplies([
      ChatFeedItem(id: 'sys-abc', messageType: 'text', senderType: 'bot',
          content: '죄송해요, 방금은 답변을 가져오지 못했어요.', createdAt: DateTime(2026)),
    ]);
    expect(a!.handoffLabel, '직원에게 연결하기');
  });
}
