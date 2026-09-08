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
    state = state.copyWith(
        phase: ChatRoomPhase.loaded, items: [...state.items, optimistic]);
    await _deliver(cid, content);
  }

  Future<void> retry(String clientMessageId) async {
    final item = state.items.firstWhere((i) => i.clientMessageId == clientMessageId);
    _replace(clientMessageId, item.copyWith(sendState: ChatSendState.sending));
    await _deliver(clientMessageId, item.content!); // 같은 키 재사용(CHAT-ROOM-SEND-03)
  }

  Future<void> _deliver(String cid, String content) async {
    // CHAT-ROOM-BOT-TYPING-01: 보내고 봇 응답이 오기 전까지 "상담봇이 입력 중"을 띄운다(웹 위젯과 동치).
    // 아무 반응이 없으면 고장으로 오인한다 — 응답(성공/실패)이 오면 반드시 끈다.
    state = state.copyWith(botThinking: true);
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
      // CHAT-ROOM-SEND-04: 전송은 성공했는데 봇 답변(reply)도 카드도 없으면(handoff는 {ticket_id,reason}만,
      // 드물게 rag가 reply=None) 피드에 아무것도 안 붙어 **무응답처럼 보인다**(2026-09-08 실기기: "증상 상담"
      // 눌러도 반응 없음의 2차 원인). 이때 가시적 시스템 줄을 넣어 갇힘을 막는다 — handoff는 연결 중 안내,
      // 그 외는 다시 물어봐 달라는 안내(막다른 길 금지).
      // handoff는 '연결 중' 안내(system 줄). 무답변은 봇 말풍선(text/bot)으로 넣어야 마지막 줄이 봇 답변이 되어
      // 입력창 슬롯에 [직원에게 연결] 칩이 뜬다(Q5·Q11: 폴백 문구가 가리키는 칩이 실제로 존재 = 막다른 길 금지).
      final isHandoff = res.routeTaken == 'handoff';
      final fallback = (res.botMessage == null && res.cardMessage == null)
          ? ChatFeedItem(
              id: 'sys-$cid',
              messageType: isHandoff ? 'system' : 'text',
              senderType: isHandoff ? 'system' : 'bot',
              content: isHandoff
                  ? '직원에게 연결하고 있어요. 잠시만 기다려 주세요.'
                  : '죄송해요, 방금은 답변을 가져오지 못했어요. 다시 한 번 여쭤봐 주시거나 아래 [직원에게 연결] 칩을 눌러 주세요.',
              createdAt: DateTime.now())
          : null;
      state = state.copyWith(
          phase: ChatRoomPhase.loaded,
          items: [
            ...marked,
            if (res.botMessage != null) res.botMessage!,
            if (res.cardMessage != null) res.cardMessage!,
            if (fallback != null) fallback,
          ],
          botThinking: false); // 응답 도착 → 봇 대기 표시 끔
    } catch (_) {
      // CHAT-ROOM-SEND-02: 원문 보존 + failed. 봇 처리를 시작하지 않는다(성공 위장 금지).
      _replace(
          cid,
          state.items
              .firstWhere((i) => i.clientMessageId == cid)
              .copyWith(sendState: ChatSendState.failed));
      state = state.copyWith(botThinking: false); // 실패해도 대기 표시는 끈다(고장 오인 방지의 반대편)
    }
  }

  void _replace(String cid, ChatFeedItem next) {
    state = state.copyWith(
        phase: ChatRoomPhase.loaded,
        items: [for (final i in state.items) i.clientMessageId == cid ? next : i]);
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
    state = state.copyWith(phase: ChatRoomPhase.loaded, items: merged);
  }

  StreamSubscription<bool>? _typingSub;
  Timer? _typingOff;

  /// [CHAT-ROOM-LIVE-TYPING-01] 담당 직원의 "입력 중" 신호(streamStaffTyping)를 상태에 반영한다 —
  /// 셸(provider)이 물려준다. 일시 표시일 뿐, 온라인 초록 점·답변 보장으로 바꾸지 않는다(SCOPE-01).
  /// 끔(false) 신호가 유실될 때를 대비해 6초 안전 타임아웃으로 자동 해제한다(디바운스 3초 + 여유).
  void bindTyping(Stream<bool> stream) {
    _typingSub?.cancel();
    _typingSub = stream.listen((on) {
      if (state.phase != ChatRoomPhase.loaded) return;
      _typingOff?.cancel();
      state = state.copyWith(staffTyping: on);
      if (on) {
        _typingOff = Timer(const Duration(seconds: 6), () {
          if (state.staffTyping) state = state.copyWith(staffTyping: false);
        });
      }
    }, onError: (_) {/* 끊김은 무해 — 재연결 대기 */});
  }

  Timer? _handoffTimer;
  Future<HandoffStatus> Function()? _handoffFetch;

  /// [Q18] 인계 상태(직원 확인 전/답변 도착·운영시간) 배지를 채운다. webchat과 동형 —
  /// 진입 즉시 1회 + 8초 주기 폴링으로 최신 상태(connecting→answered)를 반영한다(제출 후 무반응 해소).
  /// 실패는 완료로 위장하지 않고 loadError로 둔다(CHAT-HANDOFF-ERR-01). 셸(provider)이 fetch를 물려준다.
  void bindHandoff(Future<HandoffStatus> Function() fetch) {
    _handoffFetch = fetch;
    refreshHandoff(); // 진입 즉시(기존 인계 복원·제출 후 반영)
    _handoffTimer?.cancel();
    _handoffTimer = Timer.periodic(const Duration(seconds: 8), (_) => refreshHandoff());
  }

  /// 인계 상태를 한 번 새로 가져온다([다시 시도]·폴링 공용). 실패는 loadError로만 둔다.
  Future<void> refreshHandoff() async {
    final fetch = _handoffFetch;
    if (fetch == null) return;
    try {
      final st = await fetch();
      if (state.phase != ChatRoomPhase.error) state = state.copyWith(handoff: st);
    } catch (_) {
      state = state.copyWith(handoff: const HandoffStatus(loadError: true));
    }
  }

  /// 배지 상태를 직접 주입한다(테스트·특수 케이스). 조회 실패는 loadError로만 표시한다.
  void setHandoff(HandoffStatus status) => state = state.copyWith(handoff: status);

  StreamSubscription<bool>? _presenceSub;
  Timer? _presenceOff;

  /// [Q18③] 직원이 상담 상세를 **실제로 열어 보는 중**인지(열람 presence)를 상태에 반영한다 —
  /// typing과 같은 broadcast 채널의 'viewing' 신호(직원웹 TicketConversation open 시 emit). 배정(claim)과
  /// 무관한 실열람이라, connecting 상태에 겹치면 배지가 "직원이 확인 중이에요"로 바뀐다(SCOPE-01: 초록 점·
  /// 답변 보장 아님). 끔 신호 유실 대비 12초 안전 타임아웃(직원웹 유휴 하트비트보다 여유).
  void bindPresence(Stream<bool> stream) {
    _presenceSub?.cancel();
    _presenceSub = stream.listen((on) {
      if (state.phase != ChatRoomPhase.loaded) return;
      _presenceOff?.cancel();
      state = state.copyWith(staffViewing: on);
      if (on) {
        _presenceOff = Timer(const Duration(seconds: 12), () {
          if (state.staffViewing) state = state.copyWith(staffViewing: false);
        });
      }
    }, onError: (_) {/* 끊김은 무해 — 재연결 대기 */});
  }

  @override
  void dispose() {
    _liveSub?.cancel();
    _typingSub?.cancel();
    _typingOff?.cancel();
    _handoffTimer?.cancel();
    _presenceSub?.cancel();
    _presenceOff?.cancel();
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
  // [CHAT-ROOM-LIVE-TYPING-01] 같은 thread의 broadcast로 오는 "직원 입력 중"을 물려준다(일시 표시).
  ctl.bindTyping(repo.streamStaffTyping(key.$1));
  // [Q18] 인계 상태 배지 — 진입 즉시 + 8초 폴링(webchat 동형). thread에 인계 티켓이 있을 때만 배지가 뜬다.
  ctl.bindHandoff(() => repo.fetchHandoffStatus(key.$1));
  // [Q18③] 직원 열람 presence — typing과 같은 채널의 'viewing' broadcast. realtime 미주입이면 빈 스트림.
  ctl.bindPresence(repo.streamStaffPresence(key.$1));
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
