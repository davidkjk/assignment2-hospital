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

  // GET /chat/threads/{id}/messages 의 실제 응답은 camelCase다(webchat_service.message_to_dict).
  // 앱이 snake로만 읽어 messageType(필수)이 null→타입예외로 "대화를 불러오지 못했어요"가 나던 회귀.
  test('[CHAT-HISTORY-LOAD-01] 이력 응답의 camelCase(실서버 모양)를 파싱한다 — 로딩 실패 회귀', () {
    final item = ChatFeedItem.fromJson({
      'id': 'm1',
      'messageType': 'text',
      'senderType': 'patient',
      'content': '안녕',
      'payload': null,
      'clientMessageId': 'c-1',
      'createdAt': '2026-08-19T09:00:00Z',
    });
    expect(item.messageType, 'text');
    expect(item.senderType, 'patient');
    expect(item.clientMessageId, 'c-1');
    expect(item.createdAt, isNotNull);
    expect(item.isUnknown, isFalse); // senderType·createdAt이 있으니 unknown 아님
  });

  // Supabase 실시간(streamThread)은 DB 컬럼명 그대로 snake를 실어 온다 — 같은 파서가 둘 다 받아야 한다.
  test('[CHAT-HISTORY-LOAD-01] 실시간 snake_case도 여전히 파싱한다(폴백)', () {
    final item = ChatFeedItem.fromJson({
      'id': 'm2',
      'message_type': 'text',
      'sender_type': 'bot',
      'content': '네',
      'payload': null,
      'client_message_id': null,
      'created_at': '2026-08-19T09:01:00Z',
    });
    expect(item.messageType, 'text');
    expect(item.senderType, 'bot');
    expect(item.createdAt, isNotNull);
  });

  // GET /chat/threads/{id}/handoff 응답도 camelCase이고 phase는 이미 가공된 값을 준다
  // (webchat_service._HANDOFF_PHASE: pending→connecting / in_progress→inProgress / answered→answered).
  test('[CHAT-HANDOFF-LOAD-01] 인계 상태의 camelCase(실서버 모양)를 파싱한다', () {
    final s = HandoffStatus.fromJson({
      'phase': 'inProgress',
      'assigneeName': '김간호',
      'assigneeRole': '간호사',
      'isOpen': true,
      'hoursNote': null,
    });
    expect(s.phase, HandoffPhase.inProgress);
    expect(s.assigneeName, '김간호');
    expect(s.assigneeRole, '간호사');
    expect(s.isOpen, isTrue);
  });

  test('[CHAT-HANDOFF-LOAD-01] answered는 종료(ended), 운영시간 밖 안내문을 보존한다', () {
    final s = HandoffStatus.fromJson({
      'phase': 'answered',
      'assigneeName': null,
      'assigneeRole': null,
      'isOpen': false,
      'hoursNote': '지금은 상담 운영시간이 아니에요.',
    });
    expect(s.phase, HandoffPhase.ended);
    expect(s.isOpen, isFalse);
    expect(s.hoursNote, '지금은 상담 운영시간이 아니에요.');
  });
}
