import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart'
    show SupabaseClient, RealtimeSubscribeStatus;
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

  /// 지난 상담 진짜 삭제(CHAT-HISTORY-DELETE-01). 되돌릴 수 없음 — 화면 확인창 뒤에만 호출한다.
  /// 서버가 소유권을 검사하고(없거나 남의 방=404) 상담방·메시지·세션을 하드삭제한다.
  Future<void> deleteThread(String threadId) =>
      _api.delete('/chat/threads/$threadId', (_) {});

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

  /// [Q18③·CHAT-ROOM-LIVE-TYPING-01] 직원 열람(viewing)·입력 중(typing)은 같은 broadcast 채널
  /// (`chat-typing:<threadId>`)의 서로 다른 이벤트다. 직원웹 TicketConversation이 열릴 때 viewing on/off,
  /// 답변 작성 중 typing on/off 를 보낸다(DB 미기록 일회성 broadcast). 켬/끔만 흘린다(SCOPE-01: 초록 점·
  /// 답변 보장 아님). realtime 미주입이면 빈 스트림 둘.
  ///
  /// ⚠️ 반드시 **한 채널**에서 두 이벤트를 함께 듣는다. 예전엔 typing·viewing을 각각 `rt.channel('chat-typing:X')`로
  ///   따로 열었는데, **같은 토픽에 채널을 2개** 열면 Supabase realtime이 한쪽으로만 broadcast를 전달해
  ///   viewing은 되고 typing은 영영 안 뜨던 버그가 있었다(2026-09-09 실기기). 한 채널·두 콜백으로 합친다.
  ///
  /// [CHAT-ROOM-PATIENT-PRESENCE-01·PATIENT-TYPING-01] 방향은 양쪽이다 — 환자쪽도 **같은 채널**로
  ///   `role:'patient'`의 viewing(방 열림)·typing(입력 중)을 보낸다(직원웹 TicketDetail이 이걸 구독해
  ///   "환자 접속/입력 중"을 띄운다). 새 채널을 또 열면 위 유실 버그를 다시 부르므로 반드시 이 채널로 보낸다.
  ///   viewing:on은 구독 완료(subscribed) 후 1회, off는 방 dispose 시. typing은 반환한 sendTyping으로 emit.
  ({Stream<bool> typing, Stream<bool> viewing, void Function(bool) sendTyping})
      streamStaffLive(String threadId) {
    final rt = _realtime;
    if (rt == null) {
      return (
        typing: const Stream<bool>.empty(),
        viewing: const Stream<bool>.empty(),
        sendTyping: (_) {},
      );
    }
    final typingC = StreamController<bool>();
    final viewingC = StreamController<bool>();
    final channel = rt.channel('chat-typing:$threadId');
    void emit(dynamic payload, StreamController<bool> c) {
      // onBroadcast는 메시지 전체를 준다 — 실제 값은 payload['payload']에 있다(양쪽 형태 방어).
      final data = payload['payload'] is Map ? payload['payload'] as Map : payload;
      if (data['role'] == 'staff' && !c.isClosed) c.add(data['on'] == true);
    }
    void sendPatient(String event, bool on) => channel.sendBroadcastMessage(
          event: event,
          payload: {'role': 'patient', 'on': on},
        );
    channel
        .onBroadcast(event: 'typing', callback: (p) => emit(p, typingC))
        .onBroadcast(event: 'viewing', callback: (p) => emit(p, viewingC))
        .subscribe((status, _) {
      // 구독 전 send는 유실된다 — subscribed 후에 환자 열람 presence를 켠다.
      if (status == RealtimeSubscribeStatus.subscribed) sendPatient('viewing', true);
    });
    var open = 2; // 두 스트림이 모두 취소되면(방 dispose) 채널을 제거한다.
    void closeOne() {
      if (--open == 0) {
        sendPatient('viewing', false); // 방을 닫으면 환자 열람 종료(직원웹 12초 타임아웃도 방어).
        rt.removeChannel(channel);
      }
    }
    typingC.onCancel = closeOne;
    viewingC.onCancel = closeOne;
    return (
      typing: typingC.stream,
      viewing: viewingC.stream,
      sendTyping: (on) => sendPatient('typing', on),
    );
  }
}

final chatRepositoryProvider = Provider<ChatRepository>((ref) => ChatRepository(
      ref.watch(apiClientProvider),
      realtime: ref.watch(supabaseClientProvider),
    ));
