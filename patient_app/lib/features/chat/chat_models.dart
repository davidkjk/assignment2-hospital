/// 상담방 피드의 한 줄. 말풍선·카드·시스템 이벤트를 한 union으로 표현한다(CHAT-ROOM-FEED-01).
/// 셸은 카드의 알맹이를 모른다 — `cardType`(payload.card_type)만 읽어 T12·T13 슬롯에 넘긴다.
enum NoticeKind { medical, general } // CHAT-ROOM-VISUAL-01 머리말
enum ChatSendState { sent, sending, failed } // 환자 말풍선 전송 상태(CHAT-ROOM-SEND-*)

class ChatFeedItem {
  final String id;
  final String messageType; // 'text' | 'card' | 'system'
  final String? senderType; // 'patient' | 'bot' | 'staff' | 'system' (없으면 unknown)
  final String? content; // 카드·시스템은 null 가능(Task 1: content nullable)
  final Map<String, dynamic>? payload;
  final DateTime? createdAt;
  final String? clientMessageId; // 환자 전송 멱등 키(CHAT-ROOM-SEND-01·03)
  final ChatSendState sendState;

  const ChatFeedItem({
    required this.id,
    required this.messageType,
    this.senderType,
    this.content,
    this.payload,
    this.createdAt,
    this.clientMessageId,
    this.sendState = ChatSendState.sent,
  });

  String? get cardType => payload?['card_type'] as String?;

  NoticeKind? get noticeKind => switch (payload?['notice_kind']) {
        'medical' => NoticeKind.medical,
        'general' => NoticeKind.general,
        _ => null,
      };

  // CHAT-ROOM-EXC-01: 발신자나 시각이 비면 값을 지어내지 않고 unknown으로 표시한다.
  bool get isUnknown => senderType == null || createdAt == null;

  factory ChatFeedItem.fromJson(Map<String, dynamic> j) => ChatFeedItem(
        id: j['id'] as String,
        messageType: j['message_type'] as String,
        senderType: j['sender_type'] as String?,
        content: j['content'] as String?,
        payload: (j['payload'] as Map?)?.cast<String, dynamic>(),
        createdAt: (j['created_at'] as String?) == null
            ? null
            : DateTime.parse(j['created_at'] as String),
        clientMessageId: j['client_message_id'] as String?,
      );

  ChatFeedItem copyWith({ChatSendState? sendState}) => ChatFeedItem(
        id: id,
        messageType: messageType,
        senderType: senderType,
        content: content,
        payload: payload,
        createdAt: createdAt,
        clientMessageId: clientMessageId,
        sendState: sendState ?? this.sendState,
      );
}

/// 상담방 로드 상태(CHAT-ROOM-LOAD-01·ERR-01·EMPTY-01). loaded일 때만 items를 그린다.
enum ChatRoomPhase { loading, error, loaded }

class ChatRoomState {
  final ChatRoomPhase phase;
  final List<ChatFeedItem> items;
  final String? batchId; // 보고 있으면 이 배치를 읽음 처리(CHAT-ROOM-NOTIFY-01)
  const ChatRoomState(this.phase, {this.items = const [], this.batchId});

  bool get isEmpty =>
      phase == ChatRoomPhase.loaded && items.isEmpty; // 첫 상담(EMPTY-01)
}

/// 이전 상담 목록의 한 행(CHAT-HISTORY-LIST-01).
class ChatThreadSummary {
  final String threadId;
  final String? lastSnippet;
  final DateTime? lastAt;
  const ChatThreadSummary({required this.threadId, this.lastSnippet, this.lastAt});
  factory ChatThreadSummary.fromJson(Map<String, dynamic> j) => ChatThreadSummary(
        threadId: j['thread_id'] as String,
        lastSnippet: j['last_snippet'] as String?,
        lastAt: (j['last_at'] as String?) == null
            ? null
            : DateTime.parse(j['last_at'] as String),
      );
}
