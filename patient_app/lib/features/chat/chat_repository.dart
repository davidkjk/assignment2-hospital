import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show SupabaseClient;
import '../../core/api_client.dart';
import '../../core/providers.dart';
import 'chat_models.dart';
import 'chat_room_controller.dart' show reticketRequest;

/// 4단계 챗봇 라우터(Task 9)의 얇은 클라이언트. 오케스트레이션·멱등은 전부 서버가 하고,
/// 여기서는 client_message_id를 실어 보내기만 한다(CHAT-ROOM-SEND-01·03).
/// 라이브(직원 말풍선·타이핑·시스템 이벤트)는 Supabase Realtime으로 같은 스레드를 구독한다(T11).
class ChatRepository {
  final ApiClient _api;
  final SupabaseClient? _realtime;
  ChatRepository(this._api, {SupabaseClient? realtime}) : _realtime = realtime;

  Future<List<ChatFeedItem>> fetchMessages(String threadId) => _api.get(
        '/chat/threads/$threadId/messages',
        (j) => (j as List)
            .map((e) => ChatFeedItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  Future<String> openSession({String? resumeFrom}) => _api.post(
        '/chat/sessions',
        resumeFrom == null ? {} : {'resume_from': resumeFrom},
        (j) => (j as Map)['thread_id'] as String,
      );

  Future<ChatFeedItem> sendMessage({
    required String threadId,
    required String content,
    required String clientMessageId,
  }) =>
      _api.post(
        '/chat/messages',
        {'thread_id': threadId, 'content': content, 'client_message_id': clientMessageId},
        (j) => ChatFeedItem.fromJson(j as Map<String, dynamic>),
      );

  Future<void> markRead({required String batchId}) =>
      _api.post('/chat/read', {'batch_id': batchId}, (_) {});

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
  Future<String> resumeWithSummary(String threadId) =>
      openSession(resumeFrom: threadId);

  /// [새 질문]: 과거 문맥 없는 새 AI 상담.
  Future<String> startFreshSession() => openSession();

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
}

final chatRepositoryProvider = Provider<ChatRepository>((ref) => ChatRepository(
      ref.watch(apiClientProvider),
      realtime: ref.watch(supabaseClientProvider),
    ));
