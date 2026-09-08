import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show SupabaseClient;
import '../../core/api_client.dart';
import '../../core/providers.dart';
import 'chat_models.dart';
import 'chat_room_controller.dart' show reticketRequest;

/// 4단계 챗봇 라우터(Task 9)의 얇은 클라이언트. 오케스트레이션·멱등은 전부 서버가 하고,
/// 여기서는 client_message_id를 실어 보내기만 한다(CHAT-ROOM-SEND-01·03).
/// 라이브(직원 말풍선·타이핑·시스템 이벤트)는 Supabase Realtime으로 같은 스레드를 구독한다(T11).
/// 상담 세션 참조 — 서버가 상담방(thread)과 함께 발급하는 활성 AI 세션 번호.
/// 메시지를 보낼 땐 이 둘을 함께 실어야 서버가 그 세션에 이어 붙인다(백엔드 필수 계약).
class ChatSessionRef {
  final String threadId;
  final String aiSessionId;
  const ChatSessionRef({required this.threadId, required this.aiSessionId});
}

/// POST /chat/messages 의 응답을 담는다. 서버는 저장된 환자 메시지가 아니라 **봇 처리 결과**를
/// {route_taken, message_id, reply, restricted_block, card?} 로 준다(웹 위젯과 동일 계약).
/// reply → 봇 텍스트 말풍선, card(card_type 있음) → 카드 말풍선. 둘 다 없으면(예: handoff) null.
class SendResult {
  const SendResult({required this.routeTaken, this.botMessage, this.cardMessage});
  final String routeTaken;
  final ChatFeedItem? botMessage;
  final ChatFeedItem? cardMessage;
}

SendResult _parseSendResult(Map<String, dynamic> j, String clientMessageId) {
  final reply = j['reply'];
  final bot = (reply is String && reply.isNotEmpty)
      ? ChatFeedItem(
          id: (j['message_id'] as String?) ?? 'bot-$clientMessageId',
          messageType: 'text',
          senderType: 'bot',
          content: reply,
          createdAt: DateTime.now())
      : null;
  final card = j['card'];
  final cardItem = (card is Map && card['card_type'] is String)
      ? ChatFeedItem(
          id: 'card-$clientMessageId',
          messageType: 'card',
          senderType: 'bot',
          payload: card.cast<String, dynamic>(),
          createdAt: DateTime.now())
      : null;
  return SendResult(
      routeTaken: (j['route_taken'] as String?) ?? '',
      botMessage: bot,
      cardMessage: cardItem);
}

class ChatRepository {
  final ApiClient _api;
  final SupabaseClient? _realtime;
  ChatRepository(this._api, {SupabaseClient? realtime}) : _realtime = realtime;

  Future<List<ChatFeedItem>> fetchMessages(String threadId) => _api.get(
        '/chat/threads/$threadId/messages',
        // 백엔드 계약은 {"messages": [...]} (webchat_service·test_webchat_endpoints·웹 위젯과 동일).
        // 예전엔 최상위 배열을 기대해 `j as List`로 캐스팅하다 실제 응답을 못 읽고 방을 열 때마다
        // "대화를 불러오지 못했어요"로 떨어졌다(테스트가 FakeRepo로 이 파서를 우회해 미검출).
        (j) => ((j as Map<String, dynamic>)['messages'] as List)
            .map((e) => ChatFeedItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  /// 상담 세션을 확보한다(NAV-CHATAPP-01·CHAT-TAB-NAV-01). 서버가 로그인 환자의 활성 세션을
  /// 찾거나(없으면 새 상담방·세션 생성) 발급해 {thread_id, ai_chat_session_id}를 준다.
  /// - [threadId]를 주면 그 상담방의 세션을 확보한다(지난 상담 이어보기 — 목록에서 진입).
  /// - [resumeFrom]을 주면 직전 상담 요약을 가진 새 세션을 만든다(CHAT-ROOM-AI-REOPEN-01).
  Future<ChatSessionRef> openSession({String? resumeFrom, String? threadId, bool fresh = false}) => _api.post(
        '/chat/sessions',
        {
          if (resumeFrom != null) 'resume_from': resumeFrom,
          if (threadId != null) 'thread_id': threadId,
          if (fresh) 'fresh': true, // [새 대화] 활성 세션 무시하고 새 상담방(CHAT-ROOM-NEW-01)
        },
        (j) => ChatSessionRef(
          threadId: (j as Map)['thread_id'] as String,
          aiSessionId: j['ai_chat_session_id'] as String,
        ),
      );

  Future<SendResult> sendMessage({
    required String threadId,
    required String aiSessionId,
    required String content,
    required String clientMessageId,
  }) =>
      _api.post(
        '/chat/messages',
        {
          'thread_id': threadId,
          'ai_chat_session_id': aiSessionId, // 백엔드 필수 — 이 세션에 이어 붙인다
          'content': content,
          'client_message_id': clientMessageId,
        },
        // 응답은 저장된 ChatFeedItem이 아니라 봇 처리 결과({route_taken, message_id, reply, ...}).
        // 예전엔 이걸 ChatFeedItem.fromJson으로 캐스팅하다 j['id']에서 터져 전송을 실패로 위장했다.
        (j) => _parseSendResult(j as Map<String, dynamic>, clientMessageId),
      );

  Future<void> markRead({required String threadId}) =>
      _api.post('/chat/read', {'thread_id': threadId}, (_) {});

  Future<List<ChatThreadSummary>> fetchThreads() => _api.get(
        '/chat/threads',
        (j) => (j as List)
            .map((e) => ChatThreadSummary.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  /// 인계 상태(CHAT-HANDOFF-*). 담당자·운영시간 문구(is_open(at))는 서버가 확정한다 —
  /// 앱은 요일·점심·특정일을 재계산하지 않는다(CHAT-HANDOFF-HOURS-03).
  Future<HandoffStatus> fetchHandoffStatus(String threadId) => _api.get(
        '/chat/threads/$threadId/handoff',
        (j) => HandoffStatus.fromJson(j as Map<String, dynamic>),
      );

  /// AI 장애 시 AI를 거치지 않는 문의(create_support_ticket, CHAT-OUTAGE-INQUIRY-01).
  Future<void> createInquiry({required String threadId, required String content}) =>
      _api.post('/chat/threads/$threadId/inquiry', {'content': content}, (_) {});

  /// [이어서 AI 질문]: 직전 상담 요약(서버 Task 5)을 가진 새 AI 상담(CHAT-ROOM-END-NAV-01·AI-REOPEN-01).
  Future<ChatSessionRef> resumeWithSummary(String threadId) =>
      openSession(resumeFrom: threadId);

  /// [새 질문]: 과거 문맥 없는 새 AI 상담.
  Future<ChatSessionRef> startFreshSession() => openSession(fresh: true);

  /// 재문의(CHAT-ROOM-RETICKET-01): 완료 티켓 재개가 아니라 previous_ticket_id로 새 티켓.
  Future<void> reticket({required String previousTicketId, required String threadId}) =>
      _api.post('/chat/threads/$threadId/reticket',
          reticketRequest(previousTicketId: previousTicketId), (_) {});

  /// 라이브 대화 실시간 구독(CHAT-ROOM-LIVE-01·CONN-01). Supabase Realtime이 같은 스레드의
  /// chat_messages insert 스냅샷을 준다 — 직원 말풍선·시스템 이벤트가 같은 피드로 들어온다.
  /// 재연결 커서 = (thread_id, created_at, id)(3A §8-10). realtime 미주입이면 빈 스트림.
  Stream<List<ChatFeedItem>> streamThread(String threadId) {
    final rt = _realtime;
    if (rt == null) return const Stream.empty();
    return rt
        .from('chat_messages')
        .stream(primaryKey: ['id'])
        .eq('thread_id', threadId)
        .order('created_at')
        .map((rows) => rows.map(ChatFeedItem.fromJson).toList());
  }

  /// [CHAT-ROOM-LIVE-TYPING-01] 담당 직원이 답변을 작성 중이면 "직원이 입력 중입니다"를 일시 표시한다.
  /// 직원웹이 같은 thread 채널(`chat-typing:<threadId>`)로 보내는 **일회성 broadcast**(DB 미기록)를
  /// 구독한다 — 켬(true)/끔(false)만 흘린다. 온라인 초록 점·답변 보장으로 바꾸지 않는다(SCOPE-01).
  /// realtime 미주입이면 빈 스트림(무해). 유휴 시 끔 신호가 유실돼도 뷰가 자체 타임아웃으로 내린다.
  Stream<bool> streamStaffTyping(String threadId) {
    final rt = _realtime;
    if (rt == null) return const Stream<bool>.empty();
    final controller = StreamController<bool>();
    final channel = rt.channel('chat-typing:$threadId');
    channel.onBroadcast(
      event: 'typing',
      callback: (payload) {
        // onBroadcast는 메시지 전체를 준다 — 실제 값은 payload['payload']에 있다(양쪽 형태 방어).
        final data = payload['payload'] is Map ? payload['payload'] as Map : payload;
        if (data['role'] == 'staff' && !controller.isClosed) {
          controller.add(data['on'] == true);
        }
      },
    ).subscribe();
    controller.onCancel = () => rt.removeChannel(channel);
    return controller.stream;
  }
}

final chatRepositoryProvider = Provider<ChatRepository>((ref) => ChatRepository(
      ref.watch(apiClientProvider),
      realtime: ref.watch(supabaseClientProvider),
    ));
