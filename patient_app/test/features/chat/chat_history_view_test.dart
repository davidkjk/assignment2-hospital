import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hospital_patient_app/features/chat/chat_models.dart';
import 'package:hospital_patient_app/features/chat/chat_history_view.dart';

Widget _scope(
        FutureOr<List<ChatThreadSummary>> Function() create,
        {void Function(String)? onOpen,
        Future<bool> Function(String)? onDelete}) =>
    ProviderScope(
        overrides: [chatHistoryProvider.overrideWith((ref) => create())],
        child: MaterialApp(home: ChatHistoryView(onOpen: onOpen, onDelete: onDelete)));

void main() {
  final one = [const ChatThreadSummary(threadId: 't1', lastSnippet: '두통 상담')];

  testWidgets('[CHAT-HISTORY-LOAD-01] 최초 조회 중엔 목록 로딩만 — 0건을 먼저 안 그린다', (t) async {
    // 완결되지 않는 future로 로딩 상태를 고정한다.
    await t.pumpWidget(_scope(() => Completer<List<ChatThreadSummary>>().future));
    await t.pump();
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.textContaining('첫 상담'), findsNothing);
  });

  testWidgets('[CHAT-HISTORY-EMPTY-01] 0건이면 첫 상담 안내 — 조회 오류와 구분', (t) async {
    await t.pumpWidget(_scope(() => <ChatThreadSummary>[]));
    await t.pumpAndSettle();
    expect(find.textContaining('첫 상담'), findsOneWidget);
    expect(find.text('다시 시도'), findsNothing);
  });

  testWidgets('[CHAT-HISTORY-ERR-01] 조회 실패면 오류 + [다시 시도] — 과거 없다고 말하지 않는다',
      (t) async {
    await t.pumpWidget(
        _scope(() => Future<List<ChatThreadSummary>>.error(Exception('x'))));
    await t.pumpAndSettle();
    expect(find.text('다시 시도'), findsOneWidget);
    expect(find.textContaining('첫 상담'), findsNothing);
  });

  testWidgets('[CHAT-HISTORY-LIST-01] 1건 이상이면 식별 가능한 행으로 표시', (t) async {
    await t.pumpWidget(_scope(() => one));
    await t.pumpAndSettle();
    expect(find.text('두통 상담'), findsOneWidget);
  });

  testWidgets('[CHAT-HISTORY-LIST-01] 행에 날짜를 함께 보여 구분한다(요약+날짜)', (t) async {
    final withDate = [
      ChatThreadSummary(
          threadId: 't1', lastSnippet: '두통 상담', lastAt: DateTime(2026, 9, 5, 15, 12)),
    ];
    await t.pumpWidget(_scope(() => withDate));
    await t.pumpAndSettle();
    expect(find.text('두통 상담'), findsOneWidget);
    expect(find.text('9월 5일 오후 3:12'), findsOneWidget); // 날짜 부제
  });

  testWidgets('[CHAT-HISTORY-LIST-01] 요약이 없어도 날짜로 행을 구분한다("상담"만 반복되지 않음)', (t) async {
    final noSnippet = [
      ChatThreadSummary(threadId: 't1', lastAt: DateTime(2026, 9, 5, 9, 0)),
      ChatThreadSummary(threadId: 't2', lastAt: DateTime(2026, 9, 3, 14, 30)),
    ];
    await t.pumpWidget(_scope(() => noSnippet));
    await t.pumpAndSettle();
    // 폴백 제목 'AI 상담'은 두 행 + 앱바 타이틀이라 최소 2개. 행 구분의 핵심은 서로 다른 날짜다.
    expect(find.text('AI 상담'), findsAtLeastNWidgets(2));
    expect(find.text('9월 5일 오전 9:00'), findsOneWidget); // 서로 다른 날짜로 구분됨
    expect(find.text('9월 3일 오후 2:30'), findsOneWidget);
  });

  testWidgets('[CHAT-HISTORY-RESTORE-01] 행을 누르면 그 방 식별자로 복원 이동한다', (t) async {
    String? opened;
    await t.pumpWidget(_scope(() => one, onOpen: (id) => opened = id));
    await t.pumpAndSettle();
    await t.tap(find.text('두통 상담'));
    expect(opened, 't1'); // 같은 threadId로 /chat/room/:id 복원
  });

  testWidgets('[CHAT-HISTORY-DELETE-01] 스와이프하면 되돌릴 수 없다는 빨간 확인창을 먼저 띄운다', (t) async {
    await t.pumpWidget(_scope(() => one, onDelete: (_) async => true));
    await t.pumpAndSettle();
    await t.drag(find.text('두통 상담'), const Offset(-500, 0));
    await t.pumpAndSettle();
    // 되돌릴 수 없음을 알리는 확인창 — 삭제는 확인 뒤에만.
    expect(find.textContaining('삭제'), findsWidgets);
    expect(find.textContaining('되돌릴 수 없'), findsOneWidget);
  });

  testWidgets('[CHAT-HISTORY-DELETE-01] 확인창에서 삭제를 누르면 그 방을 삭제하고 목록에서 사라진다', (t) async {
    String? deleted;
    await t.pumpWidget(_scope(() => one, onDelete: (id) async {
      deleted = id;
      return true;
    }));
    await t.pumpAndSettle();
    await t.drag(find.text('두통 상담'), const Offset(-500, 0));
    await t.pumpAndSettle();
    await t.tap(find.widgetWithText(TextButton, '삭제'));
    await t.pumpAndSettle();
    expect(deleted, 't1'); // 그 방을 진짜 삭제
    expect(find.text('두통 상담'), findsNothing); // 목록에서 사라짐
  });

  testWidgets('[CHAT-HISTORY-DELETE-01] 확인창에서 취소하면 삭제하지 않고 행이 남는다', (t) async {
    var called = false;
    await t.pumpWidget(_scope(() => one, onDelete: (_) async {
      called = true;
      return true;
    }));
    await t.pumpAndSettle();
    await t.drag(find.text('두통 상담'), const Offset(-500, 0));
    await t.pumpAndSettle();
    await t.tap(find.widgetWithText(TextButton, '취소'));
    await t.pumpAndSettle();
    expect(called, isFalse); // 삭제 안 함
    expect(find.text('두통 상담'), findsOneWidget); // 행 유지
  });
}
