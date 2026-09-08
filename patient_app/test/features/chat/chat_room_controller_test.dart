import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/chat_models.dart';
import 'package:hospital_patient_app/features/chat/chat_repository.dart' show SendResult;
import 'package:hospital_patient_app/features/chat/chat_room_controller.dart';

// 가짜 저장소: 시나리오를 주입한다.
class _FakeRepo implements ChatRepositoryLike {
  List<ChatFeedItem>? messages;
  Object? loadError;
  Object? sendError;
  String? botReply; // 서버가 돌려주는 봇 답변(reply). 있으면 전송 성공 시 봇 말풍선이 붙어야 한다.
  final List<String> sentIds = [];
  @override
  Future<List<ChatFeedItem>> fetchMessages(String t) async {
    if (loadError != null) throw loadError!;
    return messages ?? [];
  }

  final List<String> sentSessionIds = [];
  @override
  Future<SendResult> sendMessage(
      {required String threadId,
      required String aiSessionId,
      required String content,
      required String clientMessageId}) async {
    sentIds.add(clientMessageId);
    sentSessionIds.add(aiSessionId);
    if (sendError != null) throw sendError!;
    return SendResult(
      routeTaken: 'rag',
      botMessage: botReply == null
          ? null
          : ChatFeedItem(
              id: 'bot-$clientMessageId',
              messageType: 'text',
              senderType: 'bot',
              content: botReply,
              createdAt: DateTime(2026)),
    );
  }

  @override
  Future<void> markRead({required String threadId}) async {}
}

void main() {
  test('[CHAT-ROOM-LOAD-01] 시작은 loading — 첫 상담/0건을 먼저 그리지 않는다', () {
    final c = ChatRoomController(_FakeRepo(), threadId: 't1');
    expect(c.state.phase, ChatRoomPhase.loading); // load() 전엔 loaded/empty가 아님
  });

  test('[CHAT-ROOM-EMPTY-01] 복원 0건이면 오류가 아니라 empty(loaded)로 — 시작 안내 자리', () async {
    final repo = _FakeRepo()..messages = [];
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    expect(c.state.phase, ChatRoomPhase.loaded);
    expect(c.state.isEmpty, isTrue); // 조회 오류가 아니다(ERR과 구분)
  });

  test('[CHAT-ROOM-ERR-01] 복원 실패는 error — 새 빈 대화로 덮어쓰지 않는다', () async {
    final repo = _FakeRepo()..loadError = Exception('boom');
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    expect(c.state.phase, ChatRoomPhase.error); // empty가 아니다(빈 대화 위장 금지)
  });

  test('[CHAT-TAB-NAV-01] 전송은 활성 AI 세션 번호를 함께 실어 보낸다(백엔드 필수)', () async {
    final repo = _FakeRepo()..messages = [];
    final c = ChatRoomController(repo, threadId: 't1', aiSessionId: 's9');
    await c.load();
    await c.send('두통이 있어요');
    expect(repo.sentSessionIds, ['s9']); // 세션 번호 누락 없이 그대로 전달
  });

  test('[CHAT-ROOM-SEND-01] 전송 중엔 sending 말풍선을 낙관적으로 넣고 같은 메시지 중복 전송을 막는다',
      () async {
    final repo = _FakeRepo()..messages = [];
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    final f = c.send('두통이 있어요'); // await 전 상태 확인
    final optimistic = c.state.items.last;
    expect(optimistic.sendState, ChatSendState.sending);
    c.send('두통이 있어요'); // 같은 내용 즉시 재탭 — 진행 중이면 무시(중복 방지)
    expect(c.state.items.where((i) => i.senderType == 'patient').length, 1);
    await f;
    expect(c.state.items.last.sendState, ChatSendState.sent);
  });

  test('[CHAT-ROOM-REPLY-01] 전송 성공 시 서버가 준 봇 답변(reply)을 피드에 봇 말풍선으로 붙인다', () async {
    // 봇 답변은 realtime이 아니라 POST /chat/messages 응답의 reply로 온다(웹 위젯과 동일 계약).
    // 예전엔 응답을 버려 봇 말풍선이 아예 안 떴고, ChatFeedItem으로 캐스팅하다 터져 전송이 실패로
    // 위장됐다 — 이 케이스가 그 회귀를 막는다.
    final repo = _FakeRepo()
      ..messages = []
      ..botReply = '진료시간은 평일 낮입니다.';
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    await c.send('진료시간 알려줘');
    final patient = c.state.items.firstWhere((i) => i.senderType == 'patient');
    expect(patient.sendState, ChatSendState.sent); // 전송은 성공으로 표시(실패 위장 아님)
    final bot = c.state.items.where((i) => i.senderType == 'bot').toList();
    expect(bot.single.content, '진료시간은 평일 낮입니다.'); // 봇 답변 말풍선이 붙었다
  });

  test('[CHAT-ROOM-SEND-02] 전송 실패는 원문을 failed로 보존하고 봇 처리를 시작하지 않는다', () async {
    final repo = _FakeRepo()
      ..messages = []
      ..sendError = Exception('net');
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    await c.send('안녕');
    final last = c.state.items.last;
    expect(last.sendState, ChatSendState.failed);
    expect(last.content, '안녕'); // 원문 보존
    expect(c.state.items.any((i) => i.senderType == 'bot'), isFalse); // 봇 답변 없음
  });

  test('[CHAT-ROOM-SEND-03] 재전송은 같은 client_message_id로 다시 보내고 새 말풍선을 안 만든다',
      () async {
    final repo = _FakeRepo()
      ..messages = []
      ..sendError = Exception('net');
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    await c.send('안녕');
    final failedId = c.state.items.last.clientMessageId;
    repo.sendError = null; // 이번엔 성공
    await c.retry(failedId!);
    expect(repo.sentIds, [failedId, failedId]); // 같은 키 재사용
    expect(c.state.items.where((i) => i.senderType == 'patient').length, 1); // 중복 없음
  });

  test('[CHAT-ROOM-NOTIFY-01] 상담방을 열면(load) 미확인 배치를 읽음 처리한다 — 보는 중엔 알리지 않는다',
      () async {
    String? readBatch;
    final repo = _FakeRepo();
    final c = ChatRoomController(repo, threadId: 't1', onMarkRead: (b) => readBatch = b);
    await c.load(batchId: 'b7');
    expect(readBatch, 'b7'); // 열람 = 확인 → 서버가 그 배치로 새 알림을 내지 않는다
  });
}
