import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hospital_patient_app/features/chat/chat_models.dart';
import 'package:hospital_patient_app/features/chat/chat_history_view.dart';

Widget _scope(
        FutureOr<List<ChatThreadSummary>> Function() create,
        {void Function(String)? onOpen}) =>
    ProviderScope(
        overrides: [chatHistoryProvider.overrideWith((ref) => create())],
        child: MaterialApp(home: ChatHistoryView(onOpen: onOpen)));

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

  testWidgets('[CHAT-HISTORY-RESTORE-01] 행을 누르면 그 방 식별자로 복원 이동한다', (t) async {
    String? opened;
    await t.pumpWidget(_scope(() => one, onOpen: (id) => opened = id));
    await t.pumpAndSettle();
    await t.tap(find.text('두통 상담'));
    expect(opened, 't1'); // 같은 threadId로 /chat/room/:id 복원
  });
}
