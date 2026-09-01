import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/chat_models.dart';
import 'package:hospital_patient_app/features/chat/chat_room_controller.dart';

// 계약이 3메서드로 유지됨을 못박는 가짜 저장소(라이브·인계 확장이 계약을 넓히지 않는다).
class _Repo implements ChatRepositoryLike {
  @override
  Future<List<ChatFeedItem>> fetchMessages(String t) async => [];
  @override
  Future<ChatFeedItem> sendMessage({required String threadId,
      required String content, required String clientMessageId}) async =>
      ChatFeedItem(id: 'x', messageType: 'text', senderType: 'patient', content: content,
          createdAt: DateTime(2026), clientMessageId: clientMessageId);
  @override
  Future<void> markRead({required String batchId}) async {}
}

void main() {
  test('[CHAT-ROOM-AI-EXPIRE-01] 마지막 활동 30분 뒤 무활동이면 그 AI 상담만 만료 — 기록은 보존', () {
    final last = DateTime(2026, 1, 1, 9, 0);
    expect(isAiSessionExpired(last, now: DateTime(2026, 1, 1, 9, 29)), isFalse); // 30분 전
    expect(isAiSessionExpired(last, now: DateTime(2026, 1, 1, 9, 30)), isTrue);  // [C6-#8 F06] 정확히 30분=만료(서버 >= 와 일치)
    expect(isAiSessionExpired(last, now: DateTime(2026, 1, 1, 9, 31)), isTrue);  // 30분 후
  });

  test('[CHAT-ROOM-AI-EXPIRE-02] 직원 연결/상담 중이면 30분 만료를 적용하지 않는다', () {
    final last = DateTime(2026, 1, 1, 9, 0);
    expect(isAiSessionExpired(last, now: DateTime(2026, 1, 1, 12, 0),
        handoffActive: true), isFalse); // 직원 [상담 종료] 전까지 유지
  });

  test('[CHAT-ROOM-RETICKET-01] 종료 뒤 새 AI 질문이 다시 직원 확인 필요면 완료 티켓 재개가 아니라 새 티켓', () {
    // 컨트롤러가 재문의 시 previous_ticket_id를 실어 새 티켓을 만들고 이전 기록은 계속 보여준다.
    expect(reticketRequest(previousTicketId: 'tk1')['previous_ticket_id'], 'tk1');
    expect(reticketRequest(previousTicketId: 'tk1').containsKey('reopen'), isFalse);
  });

  test('계약 유지: ChatRepositoryLike는 3메서드만(라이브 확장이 넓히지 않음)', () async {
    final ChatRepositoryLike r = _Repo();
    expect(await r.fetchMessages('t'), isEmpty);
  });
}
