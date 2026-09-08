import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';
import 'chat_models.dart';
import 'chat_repository.dart';

/// 테스트에서 가짜 저장소를 주입하기 위한 최소 계약.
abstract class ChatRepositoryLike {
  Future<List<ChatFeedItem>> fetchMessages(String threadId);
  Future<SendResult> sendMessage(
      {required String threadId,
      required String aiSessionId,
      required String content,
      required String clientMessageId});
  Future<void> markRead({required String threadId});
}

/// 상담방 셸의 상태 기계. 복원(CHAT-ROOM-LOAD/EMPTY/ERR)·전송(SEND-01·02·03)·읽음(NOTIFY-01).
/// T11이 라이브/인계·재문의 전이를 이 컨트롤러에 확장한다(같은 피드·같은 식별자).
class ChatRoomController extends StateNotifier<ChatRoomState> {
  final ChatRepositoryLike _repo;
  final String threadId;
  final String aiSessionId; // 전송 시 함께 실어 보내는 활성 AI 세션(백엔드 필수)
  final void Function(String batchId)? onMarkRead;
  ChatRoomController(this._repo,
      {required this.threadId, this.aiSessionId = '', this.onMarkRead})
      : super(const ChatRoomState(ChatRoomPhase.loading));

  Future<void> load({String? batchId}) async {
    state = const ChatRoomState(ChatRoomPhase.loading);
    try {
      final items = await _repo.fetchMessages(threadId);
      state = ChatRoomState(ChatRoomPhase.loaded, items: items, batchId: batchId);
      if (batchId != null) {
        // CHAT-ROOM-NOTIFY-01: 열람 = 확인. 읽음처리는 이 상담방(thread) 단위다(백엔드 /chat/read).
        onMarkRead?.call(batchId);
        // 읽음처리(부가 기능)가 실패해도 이미 그려진 대화를 error로 덮지 않는다(방어).
        try {
          await _repo.markRead(threadId: threadId);
        } catch (_) {/* best-effort */}
      }
    } catch (_) {
      state = const ChatRoomState(ChatRoomPhase.error); // 빈 대화로 덮지 않는다
    }
  }

  // 서버 client_message_id 컬럼은 UUID(전역 unique 멱등 키, 00053). 실제 UUID를 만들어야
  // 서버가 받는다(옛 "microseconds-seq"는 UUID가 아니라 422). 재전송은 같은 키 재사용(SEND-03).
  String _newClientId() => const Uuid().v4();

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
      final res = await _repo.sendMessage(
          threadId: threadId, aiSessionId: aiSessionId, content: content, clientMessageId: cid);
      // 환자 말풍선을 sent로 바꾸고, 서버가 준 봇 답변(reply)·카드(no_answer 등)를 피드에 이어 붙인다.
      // 봇 답변은 realtime이 아니라 이 응답으로 온다(웹 위젯과 동일 계약) — 예전엔 응답을 버려
      // 봇 말풍선이 아예 안 떴다(+ 파싱 예외로 전송이 실패로 위장됐다).
      final marked = [
        for (final i in state.items)
          i.clientMessageId == cid ? i.copyWith(sendState: ChatSendState.sent) : i
      ];
      state = ChatRoomState(
          ChatRoomPhase.loaded,
          items: [
            ...marked,
            if (res.botMessage != null) res.botMessage!,
            if (res.cardMessage != null) res.cardMessage!,
          ],
          batchId: state.batchId);
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

  StreamSubscription<List<ChatFeedItem>>? _liveSub;

  /// [CHAT-ROOM-LIVE-01·CONN-01] 셸(provider)이 실시간 스트림(streamThread)을 물려준다.
  /// 계약(ChatRepositoryLike)은 3메서드로 유지하고 라이브는 여기로 주입한다 — 직원 말풍선·시스템
  /// 이벤트가 같은 피드로 들어온다. dispose에서 구독을 끊는다.
  void bindLive(Stream<List<ChatFeedItem>> stream) {
    _liveSub?.cancel();
    _liveSub = stream.listen(mergeLiveRows, onError: (_) {/* CONN-01: 끊김은 원문 보존, 재연결 대기 */});
  }

  /// 실시간 스냅샷을 피드에 병합한다(CHAT-ROOM-LIVE-01). Supabase `.stream()`은 매 변경마다 전체
  /// 목록을 재방출하므로 id로 중복을 막는다. 병합 대상은 **직원(staff)·시스템 이벤트**뿐 —
  /// 환자 에코와 봇 답변은 send 응답/낙관 말풍선이 이미 소유한다(중복 말풍선 금지).
  void mergeLiveRows(List<ChatFeedItem> rows) {
    if (state.phase != ChatRoomPhase.loaded) return;
    final have = state.items.map((i) => i.id).toSet();
    final adds = [
      for (final r in rows)
        if ((r.senderType == 'staff' ||
                r.senderType == 'system' ||
                r.messageType == 'system') &&
            !have.contains(r.id))
          r
    ];
    if (adds.isEmpty) return;
    final merged = [...state.items, ...adds]
      ..sort((a, b) {
        final x = a.createdAt, y = b.createdAt;
        if (x == null && y == null) return 0;
        if (x == null) return 1; // 시각 미상은 뒤로(EXC-01)
        if (y == null) return -1;
        return x.compareTo(y);
      });
    state = ChatRoomState(ChatRoomPhase.loaded, items: merged, batchId: state.batchId);
  }

  @override
  void dispose() {
    _liveSub?.cancel();
    super.dispose();
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

/// 상담방 식별자 = (상담방 thread, 활성 AI 세션). 세션 번호가 있어야 전송이 서버에 붙는다.
typedef ChatRoomKey = (String threadId, String aiSessionId);

final chatRoomProvider =
    StateNotifierProvider.family<ChatRoomController, ChatRoomState, ChatRoomKey>(
        (ref, key) {
  final repo = ref.watch(chatRepositoryProvider);
  final ctl = ChatRoomController(_RepoAdapter(repo),
      threadId: key.$1, aiSessionId: key.$2, onMarkRead: (_) {});
  ctl.load(); // 방을 열면 복원한다(셸 진입 = 자동 load). 배치 확인은 딥링크/알림이 batchId로 정밀화(T11).
  // [CHAT-ROOM-LIVE-01] 같은 스레드의 실시간 스냅샷(직원 말풍선·시스템 이벤트)을 컨트롤러에 물려준다.
  // realtime 미주입(supabaseClient null)이면 streamThread는 빈 스트림이라 무해하다.
  ctl.bindLive(repo.streamThread(key.$1));
  return ctl;
});

// 실 저장소를 컨트롤러 계약에 맞춘다(sendMessage 시그니처 동일).
class _RepoAdapter implements ChatRepositoryLike {
  final ChatRepository _r;
  _RepoAdapter(this._r);
  @override
  Future<List<ChatFeedItem>> fetchMessages(String t) => _r.fetchMessages(t);
  @override
  Future<SendResult> sendMessage(
          {required String threadId,
          required String aiSessionId,
          required String content,
          required String clientMessageId}) =>
      _r.sendMessage(
          threadId: threadId,
          aiSessionId: aiSessionId,
          content: content,
          clientMessageId: clientMessageId);
  @override
  Future<void> markRead({required String threadId}) => _r.markRead(threadId: threadId);
}
