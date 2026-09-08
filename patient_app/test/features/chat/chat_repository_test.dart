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
    await r.sendMessage(
        threadId: 't1', aiSessionId: 's1', content: '안녕', clientMessageId: 'c-123');
    expect(sentBody, contains('c-123'));
    expect(sentBody, contains('안녕'));
    // 백엔드 필수 계약: 활성 AI 세션 번호를 함께 실어야 그 세션에 붙는다(안 실으면 서버 422).
    expect(sentBody, contains('ai_chat_session_id'));
    expect(sentBody, contains('s1'));
  });

  test('[CHAT-TAB-NAV-01] openSession은 thread_id + ai_chat_session_id 둘 다 받는다', () async {
    final r = repo(MockClient((req) async => http.Response(
        '{"thread_id":"t7","ai_chat_session_id":"s7"}', 200)));
    final ref = await r.openSession();
    expect(ref.threadId, 't7');
    expect(ref.aiSessionId, 's7');
  });

  test('[CHAT-ROOM-SEND-03] 재전송은 같은 client_message_id를 그대로 재사용한다', () async {
    final ids = <String>[];
    final r = repo(MockClient((req) async {
      ids.add(RegExp(r'"client_message_id":"([^"]+)"')
          .firstMatch(req.body)!
          .group(1)!);
      return http.Response.bytes(utf8.encode(savedMsg), 200);
    }));
    await r.sendMessage(threadId: 't1', aiSessionId: 's1', content: 'x', clientMessageId: 'same');
    await r.sendMessage(
        threadId: 't1', aiSessionId: 's1', content: 'x', clientMessageId: 'same'); // 재전송
    expect(ids, ['same', 'same']); // 새 키를 만들지 않는다 → 서버가 중복 저장 거부
  });

  test('[CHAT-HISTORY-LIST-01] fetchThreads가 이전 상담 요약 목록을 준다', () async {
    final r = repo(MockClient((req) async => http.Response.bytes(utf8.encode('[{"thread_id":"t1","last_snippet":"두통","last_at":"2026-08-18T10:00:00Z"}]'), 200)));
    final list = await r.fetchThreads();
    expect(list.single.threadId, 't1');
    expect(list.single.lastSnippet, '두통');
  });

  test('[CHAT-ROOM-RESTORE-01] fetchMessages는 {"messages":[...]} 계약을 파싱한다', () async {
    // 백엔드 GET /chat/threads/{id}/messages 는 최상위 배열이 아니라 {"messages":[...]}.
    // 예전 파서가 `j as List`라 실제 응답을 못 읽고 방을 열 때마다 error("대화를 불러오지 못했어요")로
    // 떨어졌다 — 이 케이스가 그 회귀를 막는다(FakeRepo가 파서를 우회해 미검출이던 구멍).
    final r = repo(MockClient((req) async =>
        http.Response.bytes(utf8.encode('{"messages":[$savedMsg]}'), 200)));
    final list = await r.fetchMessages('t1');
    expect(list.single.content, '안녕');
  });

  test('[CHAT-ROOM-RESTORE-02] fetchMessages는 빈 이력({"messages":[]})도 정상 파싱한다', () async {
    final r = repo(MockClient((req) async => http.Response('{"messages":[]}', 200)));
    expect(await r.fetchMessages('t1'), isEmpty);
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
