import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/providers.dart';
import 'chat_models.dart';

/// 4단계 챗봇 라우터(Task 9)의 얇은 클라이언트. 오케스트레이션·멱등은 전부 서버가 하고,
/// 여기서는 client_message_id를 실어 보내기만 한다(CHAT-ROOM-SEND-01·03).
class ChatRepository {
  final ApiClient _api;
  ChatRepository(this._api);

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
}

final chatRepositoryProvider = Provider<ChatRepository>(
    (ref) => ChatRepository(ref.watch(apiClientProvider)));
