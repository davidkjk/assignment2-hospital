import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/chat_models.dart';

void main() {
  Map<String, dynamic> msg({
    String type = 'text',
    String sender = 'bot',
    String? content = '안녕하세요',
    Map<String, dynamic>? payload,
  }) => {
    'id': 'm1',
    'message_type': type,
    'sender_type': sender,
    'content': content,
    'payload': payload,
    'created_at': '2026-08-19T09:00:00Z',
    'client_message_id': null,
  };

  test('[CHAT-ROOM-FEED-01] 메시지·카드가 같은 피드 아이템 타입으로 섞인다 — 카드는 payload.card_type만 읽는다', () {
    final text = ChatFeedItem.fromJson(msg(type: 'text', content: '안녕'));
    final card = ChatFeedItem.fromJson(
        msg(type: 'card', content: null, payload: {'card_type': 'time_select'}));
    expect(text.messageType, 'text');
    expect(card.messageType, 'card');
    expect(card.cardType, 'time_select'); // 셸은 card_type만 안다(위젯은 T12·T13)
    expect(card.content, isNull); // 카드는 content가 알맹이가 아님(Task 1: content nullable)
  });

  test('[CHAT-ROOM-VISUAL-01] 봇 안내는 payload.notice_kind로 진료/병원 머리말을 가른다 — 색이 아니다', () {
    final medical = ChatFeedItem.fromJson(msg(payload: {'notice_kind': 'medical'}));
    final general = ChatFeedItem.fromJson(msg(payload: {'notice_kind': 'general'}));
    final plain = ChatFeedItem.fromJson(msg(payload: null));
    expect(medical.noticeKind, NoticeKind.medical);
    expect(general.noticeKind, NoticeKind.general);
    expect(plain.noticeKind, isNull); // 구분 대상 아님 — 머리말 없음
  });

  test('[CHAT-ROOM-EXC-01] 서버 상태·시간·사유가 없으면 값을 지어내지 않고 unknown으로 남긴다', () {
    // sender_type·created_at이 비면 화면이 임의 시각/발신자를 만들지 않는다.
    final bad = ChatFeedItem.fromJson({
      'id': 'x',
      'message_type': 'text',
      'sender_type': null,
      'content': '?',
      'created_at': null,
      'payload': null,
    });
    expect(bad.isUnknown, isTrue); // 조회 오류/직원 확인 필요로 처리할 신호
    expect(bad.createdAt, isNull); // "지금"으로 채우지 않는다
  });

  test('[CHAT-HISTORY-RESTORE-01] 시스템 이벤트(인계 상태)도 같은 식별자로 복원된다', () {
    final sys = ChatFeedItem.fromJson(msg(
        type: 'system',
        sender: 'system',
        content: null,
        payload: {'event': 'handoff_started'}));
    expect(sys.messageType, 'system');
    expect(sys.payload!['event'], 'handoff_started'); // 인계 상태 보존(T11이 렌더)
  });
}
