import 'dart:async';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/api_client.dart' show ApiException;
import 'package:hospital_patient_app/features/chat/chat_models.dart';
import 'package:hospital_patient_app/features/chat/chat_repository.dart' show SendResult;
import 'package:hospital_patient_app/features/chat/chat_room_controller.dart';

// 가짜 저장소: 시나리오를 주입한다.
class _FakeRepo implements ChatRepositoryLike {
  List<ChatFeedItem>? messages;
  Object? loadError;
  Object? sendError;
  String? botReply; // 서버가 돌려주는 봇 답변(reply). 있으면 전송 성공 시 봇 말풍선이 붙어야 한다.
  final List<String> sentIds = [];
  @override
  Future<List<ChatFeedItem>> fetchMessages(String t) async {
    if (loadError != null) throw loadError!;
    return messages ?? [];
  }

  final List<String> sentSessionIds = [];
  Completer<void>? sendGate; // 있으면 응답을 이 게이트가 열릴 때까지 붙잡는다(대기 상태 관찰용)
  SendResult? sendResult; // 있으면 이 결과를 그대로 반환(handoff/무응답 등 특수 케이스 주입)
  @override
  Future<SendResult> sendMessage(
      {required String threadId,
      required String aiSessionId,
      required String content,
      required String clientMessageId}) async {
    sentIds.add(clientMessageId);
    sentSessionIds.add(aiSessionId);
    if (sendGate != null) await sendGate!.future;
    if (sendError != null) throw sendError!;
    if (sendResult != null) return sendResult!;
    return SendResult(
      routeTaken: 'rag',
      botMessage: botReply == null
          ? null
          : ChatFeedItem(
              id: 'bot-$clientMessageId',
              messageType: 'text',
              senderType: 'bot',
              content: botReply,
              createdAt: DateTime(2026)),
    );
  }

  @override
  Future<void> markRead({required String threadId}) async {}

  final List<String> inquiries = []; // createInquiry로 남긴 문의 본문(장애 화면 [문의 남기기])
  Object? inquiryError; // 있으면 createInquiry가 던진다(문의 실패 관찰용)
  @override
  Future<void> createInquiry({required String threadId, required String content}) async {
    if (inquiryError != null) throw inquiryError!;
    inquiries.add(content);
  }
}

void main() {
  test('[CHAT-ROOM-LOAD-01] 시작은 loading — 첫 상담/0건을 먼저 그리지 않는다', () {
    final c = ChatRoomController(_FakeRepo(), threadId: 't1');
    expect(c.state.phase, ChatRoomPhase.loading); // load() 전엔 loaded/empty가 아님
  });

  test('[CHAT-ROOM-EMPTY-01] 복원 0건이면 오류가 아니라 empty(loaded)로 — 시작 안내 자리', () async {
    final repo = _FakeRepo()..messages = [];
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    expect(c.state.phase, ChatRoomPhase.loaded);
    expect(c.state.isEmpty, isTrue); // 조회 오류가 아니다(ERR과 구분)
  });

  test('[CHAT-ROOM-ERR-01] 복원 실패는 error — 새 빈 대화로 덮어쓰지 않는다', () async {
    final repo = _FakeRepo()..loadError = Exception('boom');
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    expect(c.state.phase, ChatRoomPhase.error); // empty가 아니다(빈 대화 위장 금지)
  });

  test('[CHAT-TAB-NAV-01] 전송은 활성 AI 세션 번호를 함께 실어 보낸다(백엔드 필수)', () async {
    final repo = _FakeRepo()..messages = [];
    final c = ChatRoomController(repo, threadId: 't1', aiSessionId: 's9');
    await c.load();
    await c.send('두통이 있어요');
    expect(repo.sentSessionIds, ['s9']); // 세션 번호 누락 없이 그대로 전달
  });

  test('[CHAT-ROOM-SEND-01] 전송 중엔 sending 말풍선을 낙관적으로 넣고 같은 메시지 중복 전송을 막는다',
      () async {
    final repo = _FakeRepo()..messages = [];
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    final f = c.send('두통이 있어요'); // await 전 상태 확인
    final optimistic = c.state.items.last;
    expect(optimistic.sendState, ChatSendState.sending);
    c.send('두통이 있어요'); // 같은 내용 즉시 재탭 — 진행 중이면 무시(중복 방지)
    expect(c.state.items.where((i) => i.senderType == 'patient').length, 1);
    await f;
    expect(c.state.items.last.sendState, ChatSendState.sent);
  });

  test('[CHAT-ROOM-REPLY-01] 전송 성공 시 서버가 준 봇 답변(reply)을 피드에 봇 말풍선으로 붙인다', () async {
    // 봇 답변은 realtime이 아니라 POST /chat/messages 응답의 reply로 온다(웹 위젯과 동일 계약).
    // 예전엔 응답을 버려 봇 말풍선이 아예 안 떴고, ChatFeedItem으로 캐스팅하다 터져 전송이 실패로
    // 위장됐다 — 이 케이스가 그 회귀를 막는다.
    final repo = _FakeRepo()
      ..messages = []
      ..botReply = '진료시간은 평일 낮입니다.';
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    await c.send('진료시간 알려줘');
    final patient = c.state.items.firstWhere((i) => i.senderType == 'patient');
    expect(patient.sendState, ChatSendState.sent); // 전송은 성공으로 표시(실패 위장 아님)
    final bot = c.state.items.where((i) => i.senderType == 'bot').toList();
    expect(bot.single.content, '진료시간은 평일 낮입니다.'); // 봇 답변 말풍선이 붙었다
  });

  test('[CHAT-ROOM-SEND-02] 전송 실패는 원문을 failed로 보존하고 봇 처리를 시작하지 않는다', () async {
    final repo = _FakeRepo()
      ..messages = []
      ..sendError = Exception('net');
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    await c.send('안녕');
    final last = c.state.items.last;
    expect(last.sendState, ChatSendState.failed);
    expect(last.content, '안녕'); // 원문 보존
    expect(c.state.items.any((i) => i.senderType == 'bot'), isFalse); // 봇 답변 없음
  });

  test('[CHAT-ROOM-SEND-03] 재전송은 같은 client_message_id로 다시 보내고 새 말풍선을 안 만든다',
      () async {
    final repo = _FakeRepo()
      ..messages = []
      ..sendError = Exception('net');
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    await c.send('안녕');
    final failedId = c.state.items.last.clientMessageId;
    repo.sendError = null; // 이번엔 성공
    await c.retry(failedId!);
    expect(repo.sentIds, [failedId, failedId]); // 같은 키 재사용
    expect(c.state.items.where((i) => i.senderType == 'patient').length, 1); // 중복 없음
  });

  test('[CHAT-ROOM-LIVE-01] 실시간 직원 말풍선을 같은 피드에 병합한다(계약은 3메서드 유지)', () async {
    // 라이브 구독은 셸(provider)이 streamThread를 물려주고 컨트롤러는 mergeLiveRows로 받는다.
    // 봇 답변은 send 응답으로 오므로 라이브 병합 대상은 직원(staff)·시스템 이벤트다.
    final repo = _FakeRepo()..messages = [];
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    c.mergeLiveRows([
      ChatFeedItem(
          id: 's1',
          messageType: 'text',
          senderType: 'staff',
          content: '직원입니다. 무엇을 도와드릴까요?',
          createdAt: DateTime(2026, 1, 1, 10)),
    ]);
    final staff = c.state.items.where((i) => i.senderType == 'staff').toList();
    expect(staff.single.content, '직원입니다. 무엇을 도와드릴까요?');
  });

  test('[CHAT-ROOM-LIVE-01] 같은 id를 다시 받아도 중복 병합하지 않는다(재연결·재방출 방어)', () async {
    final repo = _FakeRepo()..messages = [];
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    final row = ChatFeedItem(
        id: 's1', messageType: 'text', senderType: 'staff', content: 'hi',
        createdAt: DateTime(2026, 1, 1, 10));
    c.mergeLiveRows([row]);
    c.mergeLiveRows([row]); // Supabase .stream()은 전체 목록을 매번 재방출한다
    expect(c.state.items.where((i) => i.id == 's1').length, 1);
  });

  test('[CHAT-ROOM-LIVE-01] 라이브는 환자 에코를 중복으로 넣지 않는다(내 말풍선은 send가 소유)', () async {
    final repo = _FakeRepo()..messages = [];
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    await c.send('두통이 있어요'); // 낙관적 환자 말풍선(로컬)
    // realtime이 같은 환자 메시지를 persisted로 되쏴도(다른 서버 id) 중복 말풍선을 만들지 않는다.
    c.mergeLiveRows([
      ChatFeedItem(
          id: 'srv-echo', messageType: 'text', senderType: 'patient',
          content: '두통이 있어요', createdAt: DateTime(2026, 1, 1, 10)),
    ]);
    expect(c.state.items.where((i) => i.senderType == 'patient').length, 1);
  });

  test('[CHAT-ROOM-NOTIFY-01] 상담방을 열면(load) 미확인 배치를 읽음 처리한다 — 보는 중엔 알리지 않는다',
      () async {
    String? readBatch;
    final repo = _FakeRepo();
    final c = ChatRoomController(repo, threadId: 't1', onMarkRead: (b) => readBatch = b);
    await c.load(batchId: 'b7');
    expect(readBatch, 'b7'); // 열람 = 확인 → 서버가 그 배치로 새 알림을 내지 않는다
  });

  test('[CHAT-ROOM-LIVE-TYPING-01] 직원 입력 중 신호(true/false)를 staffTyping에 반영한다', () async {
    final repo = _FakeRepo()..messages = [];
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    final typing = StreamController<bool>();
    c.bindTyping(typing.stream);

    typing.add(true);
    await Future<void>.delayed(Duration.zero);
    expect(c.state.staffTyping, isTrue);

    typing.add(false);
    await Future<void>.delayed(Duration.zero);
    expect(c.state.staffTyping, isFalse);
    await typing.close();
  });

  test('[CHAT-ROOM-LIVE-TYPING-01] 타이핑 중 봇 답변이 와도 staffTyping을 잃지 않는다(상태 보존)', () async {
    final repo = _FakeRepo()
      ..messages = []
      ..botReply = '안내드립니다';
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    final typing = StreamController<bool>();
    c.bindTyping(typing.stream);
    typing.add(true);
    await Future<void>.delayed(Duration.zero);

    await c.send('질문'); // 봇 답변 말풍선이 붙는 상태 재구성
    expect(c.state.items.any((i) => i.senderType == 'bot'), isTrue);
    expect(c.state.staffTyping, isTrue); // 재구성에도 타이핑 표시 유지
    await typing.close();
  });

  test('[CHAT-ROOM-BOT-TYPING-01] 보내고 응답 오기 전엔 botThinking=true, 응답 오면 false', () async {
    final repo = _FakeRepo()
      ..messages = []
      ..botReply = '안내드립니다'
      ..sendGate = Completer<void>();
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    final f = c.send('두통'); // 아직 응답 안 옴(게이트 닫힘)
    await Future<void>.delayed(Duration.zero);
    expect(c.state.botThinking, isTrue); // 대기 중 "상담봇이 입력 중"
    repo.sendGate!.complete(); // 응답 도착
    await f;
    expect(c.state.botThinking, isFalse); // 답변 뜨면 대기 표시 끔
    expect(c.state.items.any((i) => i.senderType == 'bot'), isTrue);
  });

  test('[CHAT-ROOM-BOT-TYPING-01] 전송 실패해도 botThinking을 반드시 끈다(멈춘 채로 두지 않음)', () async {
    final repo = _FakeRepo()
      ..messages = []
      ..sendError = Exception('boom');
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    await c.send('두통');
    expect(c.state.botThinking, isFalse);
    expect(c.state.items.any((i) => i.sendState == ChatSendState.failed), isTrue);
  });

  test('[CHAT-ROOM-LIVE-TYPING-01] 끔 신호가 유실돼도 6초 안전 타임아웃으로 자동 해제한다', () {
    fakeAsync((async) {
      final repo = _FakeRepo()..messages = [];
      final c = ChatRoomController(repo, threadId: 't1');
      c.load(); // fakeAsync 안에서 완료시킨다
      async.flushMicrotasks();
      final typing = StreamController<bool>();
      c.bindTyping(typing.stream);
      typing.add(true);
      async.flushMicrotasks();
      expect(c.state.staffTyping, isTrue);
      // 끔 신호 없이 6초 경과 → 자동 해제(직원웹 디바운스 3초 + 여유)
      async.elapse(const Duration(seconds: 6));
      expect(c.state.staffTyping, isFalse);
    });
  });

  test('[CHAT-ROOM-SEND-04] handoff처럼 reply·card가 둘 다 없으면 "연결 중" 시스템 줄을 붙여 무응답을 막는다',
      () async {
    final repo = _FakeRepo()
      ..messages = []
      ..sendResult = const SendResult(routeTaken: 'handoff'); // {ticket_id,reason}만 → bot/card 없음
    final c = ChatRoomController(repo, threadId: 't1', aiSessionId: 's1');
    await c.load();
    await c.send('증상 상담');
    // 환자 말풍선 + 시스템 안내 줄(봇 말풍선 없음이어도 화면엔 무언가 보인다)
    final sys = c.state.items.where((i) => i.messageType == 'system').toList();
    expect(sys, isNotEmpty);
    expect(sys.last.content, contains('직원에게 연결'));
  });

  test('[Q18] bindHandoff는 진입 즉시 인계 상태를 채운다(제출 후 무반응 해소)', () async {
    final repo = _FakeRepo()..messages = [];
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    c.bindHandoff(() async => const HandoffStatus(phase: HandoffPhase.connecting));
    await Future<void>.delayed(Duration.zero);
    expect(c.state.handoff?.phase, HandoffPhase.connecting);
    c.dispose(); // 8초 폴링 타이머 정리
  });

  test('[Q18/CHAT-HANDOFF-ERR-01] 인계 상태 조회 실패는 loadError로 둔다(완료 위장 금지)', () async {
    final repo = _FakeRepo()..messages = [];
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    c.bindHandoff(() async => throw Exception('net'));
    await Future<void>.delayed(Duration.zero);
    expect(c.state.handoff?.loadError, isTrue);
    expect(c.state.handoff?.phase, isNull); // 완료로 바꾸지 않음
    c.dispose();
  });

  test('[Q18③] bindPresence는 직원 열람 신호(true/false)를 staffViewing에 반영한다', () async {
    final repo = _FakeRepo()..messages = [];
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    final presence = StreamController<bool>();
    c.bindPresence(presence.stream);

    presence.add(true);
    await Future<void>.delayed(Duration.zero);
    expect(c.state.staffViewing, isTrue);

    presence.add(false);
    await Future<void>.delayed(Duration.zero);
    expect(c.state.staffViewing, isFalse);
    await presence.close();
  });

  test('[Q18③] 열람 종료 신호가 유실돼도 12초 안전 타임아웃으로 자동 해제한다', () {
    fakeAsync((async) {
      final repo = _FakeRepo()..messages = [];
      final c = ChatRoomController(repo, threadId: 't1');
      c.load();
      async.flushMicrotasks();
      final presence = StreamController<bool>();
      c.bindPresence(presence.stream);
      presence.add(true);
      async.flushMicrotasks();
      expect(c.state.staffViewing, isTrue);
      async.elapse(const Duration(seconds: 12));
      expect(c.state.staffViewing, isFalse);
    });
  });

  test('[CHAT-ROOM-SEND-04/Q11] reply도 card도 없는 일반 응답이면 봇 말풍선으로 폴백 — 마지막이 봇이라 [직원에게 연결] 칩이 뜬다', () async {
    final repo = _FakeRepo()
      ..messages = []
      ..sendResult = const SendResult(routeTaken: 'rag'); // 드물게 rag가 reply=None
    final c = ChatRoomController(repo, threadId: 't1', aiSessionId: 's1');
    await c.load();
    await c.send('의사 선생님 누가 계세요?');
    // Q11: 무답변 폴백은 봇 말풍선(text/bot)이라 activeQuickReplies가 [직원에게 연결] 칩을 띄운다(막다른 길 금지).
    final last = c.state.items.last;
    expect(last.senderType, 'bot');
    expect(last.content, contains('답변을 가져오지 못했어요'));
    expect(last.content, contains('직원에게 연결'));
  });

  // ── Q19 AI 일시 장애(CHAT-OUTAGE-01) ────────────────────────────────────────
  test('[CHAT-OUTAGE-01] 전송이 5xx로 실패하면 강제 인계가 아니라 장애 화면으로 — 실패 말풍선/시스템줄 안 만든다', () async {
    final repo = _FakeRepo()
      ..messages = []
      ..sendError = ApiException('서버 오류', statusCode: 503);
    final c = ChatRoomController(repo, threadId: 't1', aiSessionId: 's1');
    await c.load();
    await c.send('배가 아파요');
    expect(c.state.outagePhase, OutageInquiryPhase.idle); // 전면 장애 화면
    expect(c.state.botThinking, isFalse); // 대기 표시는 끈다(고장 오인 방지)
    // 강제 직원인계(시스템 줄)를 만들지 않는다.
    expect(c.state.items.where((i) => i.messageType == 'system'), isEmpty);
  });

  test('[CHAT-OUTAGE-01] 4xx(세션 만료 등)는 장애 아님 — 예전처럼 실패 말풍선, 장애 화면 안 뜬다', () async {
    final repo = _FakeRepo()
      ..messages = []
      ..sendError = ApiException('세션 만료', statusCode: 401);
    final c = ChatRoomController(repo, threadId: 't1', aiSessionId: 's1');
    await c.load();
    await c.send('안녕');
    expect(c.state.outagePhase, isNull); // 장애 화면 아님
    expect(c.state.items.any((i) => i.sendState == ChatSendState.failed), isTrue);
  });

  test('[CHAT-OUTAGE-01] status 없는 네트워크 실패는 전면 장애가 아니라 실패 말풍선(과도한 에스컬레이션 방지)', () async {
    // ⚠️ webchat는 no-status도 장애로 보지만, 앱은 이미 메시지별 실패-말풍선 재시도가 있어 그쪽으로 둔다.
    //   전면 장애화면은 5xx(진짜 AI 미가용)로만.
    final repo = _FakeRepo()
      ..messages = []
      ..sendError = Exception('SocketException'); // ApiException 아님(status 없음)
    final c = ChatRoomController(repo, threadId: 't1', aiSessionId: 's1');
    await c.load();
    await c.send('여보세요');
    expect(c.state.outagePhase, isNull); // 장애 화면 아님
    expect(c.state.items.any((i) => i.sendState == ChatSendState.failed), isTrue);
  });

  test('[CHAT-OUTAGE-RECOVER-01] 장애 후 [다시 시도] 성공 = 같은 키 재전송 + 장애 해제, 봇 답변 표시', () async {
    final repo = _FakeRepo()
      ..messages = []
      ..sendError = ApiException('서버 오류', statusCode: 503);
    final c = ChatRoomController(repo, threadId: 't1', aiSessionId: 's1');
    await c.load();
    await c.send('두통이 심해요');
    final firstCid = repo.sentIds.single;
    // 서버 복구 후 재시도.
    repo.sendError = null;
    repo.botReply = '가까운 신경과를 안내드릴게요';
    await c.retryFromOutage();
    expect(c.state.outagePhase, isNull); // 성공 왕복 → 장애 해제(방 복귀)
    expect(repo.sentIds, [firstCid, firstCid]); // 같은 멱등 키로 재전송(중복 방지)
    expect(c.state.items.any((i) => i.senderType == 'bot' && i.content == '가까운 신경과를 안내드릴게요'), isTrue);
  });

  test('[CHAT-OUTAGE-INQUIRY-01] 장애 화면 [문의 남기기]: busy→done, createInquiry에 본문 전달', () async {
    final repo = _FakeRepo()
      ..messages = []
      ..sendError = ApiException('서버 오류', statusCode: 500);
    final c = ChatRoomController(repo, threadId: 't1', aiSessionId: 's1');
    await c.load();
    await c.send('상담 문의');
    await c.submitOutageInquiry('CT 준비물이 궁금해요');
    expect(c.state.outagePhase, OutageInquiryPhase.done);
    expect(repo.inquiries, ['CT 준비물이 궁금해요']);
  });

  test('[CHAT-OUTAGE-INQUIRY-01] 문의 실패는 완료로 위장하지 않고 error', () async {
    final repo = _FakeRepo()
      ..messages = []
      ..sendError = ApiException('서버 오류', statusCode: 500)
      ..inquiryError = Exception('boom');
    final c = ChatRoomController(repo, threadId: 't1', aiSessionId: 's1');
    await c.load();
    await c.send('상담 문의');
    await c.submitOutageInquiry('문의 본문');
    expect(c.state.outagePhase, OutageInquiryPhase.error);
  });
}
