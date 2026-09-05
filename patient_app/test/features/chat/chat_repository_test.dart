import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/features/chat/chat_repository.dart';

void main() {
  ChatRepository repo(MockClient mock) => ChatRepository(ApiClient(
      baseUrl: 'http://x', tokenProvider: () async => 'tk', httpClient: mock));

  // 실제 서버가 돌려주는 저장된 메시지 한 건(fromJson이 요구하는 필드 포함).
  const savedMsg = '{"id":"m9","message_type":"text","sender_type":"patient",'
      '"content":"안녕","payload":null,"created_at":"2026-08-19T09:00:00Z",'
      '"client_message_id":"c-123"}';

  test('[CHAT-ROOM-SEND-01] 전송은 client_message_id를 실어 보낸다 — 서버 멱등 키', () async {
    String? sentBody;
    final r = repo(MockClient((req) async {
      sentBody = req.body;
      return http.Response.bytes(utf8.encode(savedMsg), 200);
    }));
    await r.sendMessage(threadId: 't1', content: '안녕', clientMessageId: 'c-123');
    expect(sentBody, contains('c-123'));
    expect(sentBody, contains('안녕'));
  });

  test('[CHAT-ROOM-SEND-03] 재전송은 같은 client_message_id를 그대로 재사용한다', () async {
    final ids = <String>[];
    final r = repo(MockClient((req) async {
      ids.add(RegExp(r'"client_message_id":"([^"]+)"')
          .firstMatch(req.body)!
          .group(1)!);
      return http.Response.bytes(utf8.encode(savedMsg), 200);
    }));
    await r.sendMessage(threadId: 't1', content: 'x', clientMessageId: 'same');
    await r.sendMessage(threadId: 't1', content: 'x', clientMessageId: 'same'); // 재전송
    expect(ids, ['same', 'same']); // 새 키를 만들지 않는다 → 서버가 중복 저장 거부
  });

  test('[CHAT-HISTORY-LIST-01] fetchThreads가 이전 상담 요약 목록을 준다', () async {
    final r = repo(MockClient((req) async => http.Response.bytes(utf8.encode('[{"thread_id":"t1","last_snippet":"두통","last_at":"2026-08-18T10:00:00Z"}]'), 200)));
    final list = await r.fetchThreads();
    expect(list.single.threadId, 't1');
    expect(list.single.lastSnippet, '두통');
  });

  test('[CHAT-ROOM-NOTIFY-01] markRead는 batch_id로 확인 배치를 닫는다', () async {
    String? body;
    final r = repo(MockClient((req) async {
      body = req.body;
      return http.Response('{}', 200);
    }));
    await r.markRead(batchId: 'b5');
    expect(body, contains('b5'));
  });
}
