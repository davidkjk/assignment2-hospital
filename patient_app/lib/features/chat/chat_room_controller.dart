import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'chat_models.dart';
import 'chat_repository.dart';

/// 테스트에서 가짜 저장소를 주입하기 위한 최소 계약.
abstract class ChatRepositoryLike {
  Future<List<ChatFeedItem>> fetchMessages(String threadId);
  Future<ChatFeedItem> sendMessage(
      {required String threadId, required String content, required String clientMessageId});
  Future<void> markRead({required String batchId});
}

/// 상담방 셸의 상태 기계. 복원(CHAT-ROOM-LOAD/EMPTY/ERR)·전송(SEND-01·02·03)·읽음(NOTIFY-01).
/// T11이 라이브/인계·재문의 전이를 이 컨트롤러에 확장한다(같은 피드·같은 식별자).
class ChatRoomController extends StateNotifier<ChatRoomState> {
  final ChatRepositoryLike _repo;
  final String threadId;
  final void Function(String batchId)? onMarkRead;
  int _seq = 0;
  ChatRoomController(this._repo, {required this.threadId, this.onMarkRead})
      : super(const ChatRoomState(ChatRoomPhase.loading));

  Future<void> load({String? batchId}) async {
    state = const ChatRoomState(ChatRoomPhase.loading);
    try {
      final items = await _repo.fetchMessages(threadId);
      state = ChatRoomState(ChatRoomPhase.loaded, items: items, batchId: batchId);
      if (batchId != null) {
        // CHAT-ROOM-NOTIFY-01: 열람 = 확인
        onMarkRead?.call(batchId);
        await _repo.markRead(batchId: batchId);
      }
    } catch (_) {
      state = const ChatRoomState(ChatRoomPhase.error); // 빈 대화로 덮지 않는다
    }
  }

  String _newClientId() => '${DateTime.now().microsecondsSinceEpoch}-${_seq++}';

  Future<void> send(String content) async {
    // CHAT-ROOM-SEND-01: 진행 중인 같은 내용이 있으면 중복 전송을 막는다.
    final dup = state.items.any((i) =>
        i.senderType == 'patient' &&
        i.content == content &&
        i.sendState == ChatSendState.sending);
    if (dup) return;
    final cid = _newClientId();
    final optimistic = ChatFeedItem(
        id: cid,
        messageType: 'text',
        senderType: 'patient',
        content: content,
        createdAt: DateTime.now(),
        clientMessageId: cid,
        sendState: ChatSendState.sending);
    state = ChatRoomState(ChatRoomPhase.loaded,
        items: [...state.items, optimistic], batchId: state.batchId);
    await _deliver(cid, content);
  }

  Future<void> retry(String clientMessageId) async {
    final item = state.items.firstWhere((i) => i.clientMessageId == clientMessageId);
    _replace(clientMessageId, item.copyWith(sendState: ChatSendState.sending));
    await _deliver(clientMessageId, item.content!); // 같은 키 재사용(CHAT-ROOM-SEND-03)
  }

  Future<void> _deliver(String cid, String content) async {
    try {
      await _repo.sendMessage(threadId: threadId, content: content, clientMessageId: cid);
      _replace(
          cid,
          state.items
              .firstWhere((i) => i.clientMessageId == cid)
              .copyWith(sendState: ChatSendState.sent));
    } catch (_) {
      // CHAT-ROOM-SEND-02: 원문 보존 + failed. 봇 처리를 시작하지 않는다(성공 위장 금지).
      _replace(
          cid,
          state.items
              .firstWhere((i) => i.clientMessageId == cid)
              .copyWith(sendState: ChatSendState.failed));
    }
  }

  void _replace(String cid, ChatFeedItem next) {
    state = ChatRoomState(ChatRoomPhase.loaded,
        items: [for (final i in state.items) i.clientMessageId == cid ? next : i],
        batchId: state.batchId);
  }
}

/// AI 상담 30분 무활동 만료(CHAT-ROOM-AI-EXPIRE-01). 창을 닫아도 같은 30분 기준이며
/// 직원 연결/상담 중이면 만료하지 않는다(CHAT-ROOM-AI-EXPIRE-02).
/// C6-#8 F06(2026-08-20): 서버 primitive가 `now() >= expires_at`(정확히 30분=만료)라 client도 `>=`로 맞춘다.
bool isAiSessionExpired(DateTime lastActivity,
    {required DateTime now, bool handoffActive = false}) {
  if (handoffActive) return false;
  return now.difference(lastActivity) >= const Duration(minutes: 30);
}

/// 재문의(CHAT-ROOM-RETICKET-01): 완료 티켓을 재개하지 않고 previous_ticket_id로 새 티켓을 만든다
/// (이전 기록은 계속 보여준다). reopen 플래그를 두지 않는다.
Map<String, dynamic> reticketRequest({required String previousTicketId}) =>
    {'previous_ticket_id': previousTicketId};

final chatRoomProvider =
    StateNotifierProvider.family<ChatRoomController, ChatRoomState, String>(
        (ref, threadId) {
  final repo = ref.watch(chatRepositoryProvider);
  final ctl =
      ChatRoomController(_RepoAdapter(repo), threadId: threadId, onMarkRead: (_) {});
  ctl.load(); // 방을 열면 복원한다(셸 진입 = 자동 load). 배치 확인은 딥링크/알림이 batchId로 정밀화(T11).
  return ctl;
});

// 실 저장소를 컨트롤러 계약에 맞춘다(sendMessage 시그니처 동일).
class _RepoAdapter implements ChatRepositoryLike {
  final ChatRepository _r;
  _RepoAdapter(this._r);
  @override
  Future<List<ChatFeedItem>> fetchMessages(String t) => _r.fetchMessages(t);
  @override
  Future<ChatFeedItem> sendMessage(
          {required String threadId,
          required String content,
          required String clientMessageId}) =>
      _r.sendMessage(threadId: threadId, content: content, clientMessageId: clientMessageId);
  @override
  Future<void> markRead({required String batchId}) => _r.markRead(batchId: batchId);
}
