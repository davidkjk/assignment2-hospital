import 'dart:async';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/api_client.dart' show ApiException;
import 'package:hospital_patient_app/features/chat/chat_models.dart';
import 'package:hospital_patient_app/features/chat/chat_repository.dart' show SendResult;
import 'package:hospital_patient_app/features/chat/chat_room_controller.dart';

// 가짜 저장소: 시나리오를 주입한다.
// [CHAT-STREAM-01] 스트리밍 전환 이후 sendMessage 응답(ack)엔 봇 답이 없다({gen, routeTaken}만).
//   봇 답은 applyBotDelta/applyBotDone(실시간 채널 소비)로 붙는다 — 테스트가 그 콜백을 직접 부른다.
class _FakeRepo implements ChatRepositoryLike {
  List<ChatFeedItem>? messages;
  Object? loadError;
  Object? sendError;
  String sendGen = 'g1'; // 접수 ack가 돌려줄 회차 식별자(applyBotDone의 gen과 맞춰야 반영)
  String sendRoute = 'rag'; // ack의 routeTaken('staff'면 봇 스트림을 기다리지 않는다)
  final List<String> sentIds = [];
  final List<String> fetchCalls = []; // _reconcileFromServer가 부른 fetchMessages 추적
  @override
  Future<List<ChatFeedItem>> fetchMessages(String t) async {
    fetchCalls.add(t);
    if (loadError != null) throw loadError!;
    return messages ?? [];
  }

  final List<String> sentSessionIds = [];
  Completer<void>? sendGate; // 있으면 응답을 이 게이트가 열릴 때까지 붙잡는다(대기 상태 관찰용)
  SendResult? sendResult; // 있으면 이 결과를 그대로 반환(staff 등 특수 케이스 주입)
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
    return SendResult(routeTaken: sendRoute, gen: sendGen);
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

  test('[CHAT-STREAM-01] 전송 ack엔 봇 답이 없다 — bot_delta/bot_done(실시간)으로 봇 말풍선이 붙는다', () async {
    // 스트리밍 전환: 봇 답은 응답이 아니라 실시간 채널로 온다. ⚠️ 예전엔 응답의 reply를 붙였고,
    //   스트리밍 전환 후 응답에 답이 없어지자 앱이 늘 "답을 못 받았다"로 떨어졌다(2026-09-10 무응답 버그).
    //   이 케이스가 그 회귀(응답에서 답을 기대)를 막는다.
    final repo = _FakeRepo()
      ..messages = []
      ..sendGen = 'g1';
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    await c.send('진료시간 알려줘');
    final patient = c.state.items.firstWhere((i) => i.senderType == 'patient');
    expect(patient.sendState, ChatSendState.sent); // 전송은 성공으로 표시(실패 위장 아님)
    expect(c.state.items.any((i) => i.senderType == 'bot'), isFalse); // ack 시점엔 봇 말풍선 없음
    // 실시간 조각이 차오르고(스트림 버블) 완료에서 확정 말풍선으로 커밋된다.
    c.applyBotDelta('g1', 1, '진료시간은 ');
    c.applyBotDelta('g1', 2, '평일 낮입니다.');
    expect(c.state.streaming?.text, '진료시간은 평일 낮입니다.'); // 진행 중 스트림 버블
    c.applyBotDone(const BotDone(gen: 'g1', messageId: 'm1', routeTaken: 'rag'));
    expect(c.state.streaming, isNull); // 확정되면 임시 버블은 사라진다
    final bot = c.state.items.where((i) => i.senderType == 'bot').toList();
    expect(bot.single.content, '진료시간은 평일 낮입니다.'); // 확정 봇 말풍선
    expect(c.state.botThinking, isFalse);
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
    // 봇 답은 실시간 채널의 bot_done(broadcast)으로 오므로, DB 스냅샷(streamThread) 병합 대상은
    //   직원(staff)·시스템 이벤트다(봇 행은 여기서 무시 — bot_done이 소유해 중복 말풍선을 막는다).
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

  test('[CHAT-ROOM-LIVE-TYPING-01] 봇 답(bot_done 커밋)이 와도 staffTyping을 잃지 않는다(상태 보존)', () async {
    final repo = _FakeRepo()
      ..messages = []
      ..sendGen = 'g1';
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    final typing = StreamController<bool>();
    c.bindTyping(typing.stream);
    typing.add(true);
    await Future<void>.delayed(Duration.zero);

    await c.send('질문');
    c.applyBotDelta('g1', 1, '안내드립니다');
    c.applyBotDone(const BotDone(gen: 'g1', messageId: 'm1', routeTaken: 'rag')); // 봇 말풍선 커밋
    expect(c.state.items.any((i) => i.senderType == 'bot'), isTrue);
    expect(c.state.staffTyping, isTrue); // 커밋에도 타이핑 표시 유지
    await typing.close();
  });

  test('[CHAT-ROOM-BOT-TYPING-01] ack 뒤에도 botThinking=true 유지(스트림 대기), bot_done에서 false', () async {
    // 스트리밍: 접수 ack가 와도 답은 아직 안 왔다 — 대기 표시를 끄지 않는다(끄면 답이 안 온 채 조용해진다).
    final repo = _FakeRepo()
      ..messages = []
      ..sendGen = 'g1'
      ..sendGate = Completer<void>();
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    final f = c.send('두통'); // 아직 ack 안 옴(게이트 닫힘)
    await Future<void>.delayed(Duration.zero);
    expect(c.state.botThinking, isTrue); // 대기 중 "상담봇이 입력 중"
    repo.sendGate!.complete(); // ack 도착(하지만 봇 답은 아직)
    await f;
    expect(c.state.botThinking, isTrue); // ⭐ ack만으론 끄지 않는다 — 스트림을 기다린다
    expect(c.state.items.any((i) => i.senderType == 'bot'), isFalse);
    c.applyBotDone(const BotDone(gen: 'g1', messageId: 'm1', routeTaken: 'rag'));
    // 조각 없는 빠른 경로 — 대기는 끄고 DB에서 봇 답을 채운다.
    expect(c.state.botThinking, isFalse); // 답 확정 → 대기 표시 끔
    expect(repo.fetchCalls, contains('t1')); // 조각 없으면 DB 정본에서 채운다(reconcile)
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

  test('[CHAT-ROOM-PATIENT-TYPING-01] notifyTyping은 첫 입력에 on=true를 한 번만 보낸다(연속 입력 중복 억제)', () {
    fakeAsync((async) {
      final repo = _FakeRepo()..messages = [];
      final c = ChatRoomController(repo, threadId: 't1');
      c.load();
      async.flushMicrotasks();
      final sent = <bool>[];
      c.bindPatientTyping(sent.add);
      c.notifyTyping();
      c.notifyTyping();
      c.notifyTyping();
      expect(sent, [true]); // 매 키 입력에 재전송하지 않는다 — 켜짐은 한 번
    });
  });

  test('[CHAT-ROOM-PATIENT-TYPING-01] 마지막 입력 후 3초 유휴면 off=false를 보낸다(디바운스)', () {
    fakeAsync((async) {
      final repo = _FakeRepo()..messages = [];
      final c = ChatRoomController(repo, threadId: 't1');
      c.load();
      async.flushMicrotasks();
      final sent = <bool>[];
      c.bindPatientTyping(sent.add);
      c.notifyTyping();
      async.elapse(const Duration(seconds: 3));
      expect(sent, [true, false]); // 직원웹 setTyping과 대칭: 유휴 3초 해제
    });
  });

  test('[CHAT-ROOM-PATIENT-TYPING-01] 3초 안에 다시 입력하면 off를 미루고 새 3초를 센다', () {
    fakeAsync((async) {
      final repo = _FakeRepo()..messages = [];
      final c = ChatRoomController(repo, threadId: 't1');
      c.load();
      async.flushMicrotasks();
      final sent = <bool>[];
      c.bindPatientTyping(sent.add);
      c.notifyTyping();
      async.elapse(const Duration(seconds: 2));
      c.notifyTyping(); // 유휴 타이머 리셋
      async.elapse(const Duration(seconds: 2));
      expect(sent, [true]); // 아직 off 안 됨(마지막 입력에서 2초만 지남)
      async.elapse(const Duration(seconds: 1));
      expect(sent, [true, false]); // 마지막 입력 +3초에 off
    });
  });

  test('[CHAT-ROOM-PATIENT-TYPING-01] realtime 미주입(sink 없음)이면 notifyTyping은 무해한 no-op', () {
    fakeAsync((async) {
      final repo = _FakeRepo()..messages = [];
      final c = ChatRoomController(repo, threadId: 't1');
      c.load();
      async.flushMicrotasks();
      c.notifyTyping(); // 던지지 않는다
      async.elapse(const Duration(seconds: 3));
    });
  });

  test('[CHAT-STREAM-01] ack가 staff(인계 후 사람 상담)면 봇 스트림을 기다리지 않고 대기를 끈다', () async {
    // 이미 인계된 방: 서버가 AI를 안 돌리고 환자 메시지만 저장한다(ack routeTaken='staff').
    //   답은 직원이 실시간(streamThread)으로 보내므로 botThinking을 켜 둔 채 두지 않는다.
    final repo = _FakeRepo()
      ..messages = []
      ..sendResult = const SendResult(routeTaken: 'staff', gen: null);
    final c = ChatRoomController(repo, threadId: 't1', aiSessionId: 's1');
    await c.load();
    await c.send('직원에게 추가 질문');
    expect(c.state.botThinking, isFalse); // 스트림 대기 없음
    expect(c.state.items.any((i) => i.senderType == 'bot'), isFalse); // 봇 말풍선 만들지 않음
    expect(c.state.items.last.sendState, ChatSendState.sent); // 환자 말풍선은 sent
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

  test('[CHAT-STREAM-01/OUTAGE-01] 빈 답(bot_done outage)이면 가짜 폴백 말풍선이 아니라 장애 화면으로 안내한다', () async {
    // ⚠️ 예전엔 응답에 답이 없으면 "답변을 가져오지 못했어요" 봇 말풍선을 지어 붙였다 — 이 폴백이
    //   스트리밍 전환 후 **매 메시지마다** 떠서 무응답처럼 보였다(2026-09-10 버그의 원흉). 이제 빈 답은
    //   장애(ChatOutageView)로만 안내하고 가짜 말풍선을 만들지 않는다.
    final repo = _FakeRepo()
      ..messages = []
      ..sendGen = 'g1';
    final c = ChatRoomController(repo, threadId: 't1', aiSessionId: 's1');
    await c.load();
    await c.send('의사 선생님 누가 계세요?');
    c.applyBotDone(const BotDone(gen: 'g1', routeTaken: 'outage', outage: true));
    expect(c.state.outagePhase, OutageInquiryPhase.idle); // 전면 장애 안내
    expect(c.state.botThinking, isFalse);
    // 가짜 "답변을 가져오지 못했어요" 봇 말풍선을 만들지 않는다.
    expect(c.state.items.any((i) => i.senderType == 'bot'), isFalse);
    expect(c.state.items.any((i) => (i.content ?? '').contains('가져오지 못했')), isFalse);
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

  test('[CHAT-OUTAGE-RECOVER-01] 장애 후 [다시 시도] 성공 = 같은 키 재전송 + 봇 답(bot_done)이 오면 장애 해제', () async {
    final repo = _FakeRepo()
      ..messages = []
      ..sendError = ApiException('서버 오류', statusCode: 503);
    final c = ChatRoomController(repo, threadId: 't1', aiSessionId: 's1');
    await c.load();
    await c.send('두통이 심해요');
    final firstCid = repo.sentIds.single;
    expect(c.state.outagePhase, OutageInquiryPhase.idle); // 먼저 장애
    // 서버 복구 후 재시도 — ack가 정상으로 오고, 봇 답은 실시간으로 온다.
    repo.sendError = null;
    repo.sendGen = 'g2';
    await c.retryFromOutage();
    expect(repo.sentIds, [firstCid, firstCid]); // 같은 멱등 키로 재전송(중복 방지)
    c.applyBotDelta('g2', 1, '가까운 신경과를 안내드릴게요');
    c.applyBotDone(const BotDone(gen: 'g2', messageId: 'm2', routeTaken: 'rag'));
    expect(c.state.outagePhase, isNull); // 봇 답 도착 = 성공 왕복 → 장애 해제(방 복귀)
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

  // ── [CHAT-STREAM-01] 실시간 봇 스트림 경로(webchat useWebchat과 동형) ─────────────
  test('[CHAT-STREAM-01] 다른 회차(gen)의 조각·완료는 폐기한다(옛 답이 새 답을 덮지 않게)', () async {
    final repo = _FakeRepo()
      ..messages = []
      ..sendGen = 'g2';
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    await c.send('질문'); // 활성 회차 = g2
    c.applyBotDelta('g1', 1, '옛 답 조각'); // 지난 회차 — 무시
    expect(c.state.streaming, isNull);
    c.applyBotDone(const BotDone(gen: 'g1', messageId: 'mX', routeTaken: 'rag')); // 지난 회차 완료 — 무시
    expect(c.state.items.any((i) => i.senderType == 'bot'), isFalse);
    expect(c.state.botThinking, isTrue); // 아직 g2를 기다린다
  });

  test('[CHAT-STREAM-01] bot_done에 카드가 실려 오면 확정 말풍선과 함께 카드도 붙인다', () async {
    final repo = _FakeRepo()
      ..messages = []
      ..sendGen = 'g1';
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    await c.send('예약할래요');
    c.applyBotDelta('g1', 1, '예약을 도와드릴게요');
    c.applyBotDone(const BotDone(
        gen: 'g1', messageId: 'm1', routeTaken: 'agent',
        card: {'card_type': 'time_select', 'candidates': []}));
    expect(c.state.items.any((i) => i.senderType == 'bot' && i.content == '예약을 도와드릴게요'), isTrue);
    expect(c.state.items.any((i) => i.messageType == 'card' && i.cardType == 'time_select'), isTrue);
  });

  test('[CHAT-STREAM-FALLBACK-01] 실시간이 유실되면(45초 무이벤트) DB 재조회로 복구한다(막다른 길 금지)', () {
    fakeAsync((async) {
      final repo = _FakeRepo()
        ..messages = [
          ChatFeedItem(
              id: 'm1', messageType: 'text', senderType: 'bot',
              content: 'DB에 저장된 봇 답', createdAt: DateTime(2026, 1, 1, 10)),
        ]
        ..sendGen = 'g1';
      final c = ChatRoomController(repo, threadId: 't1');
      c.load();
      async.flushMicrotasks();
      c.send('질문');
      async.flushMicrotasks();
      expect(c.state.botThinking, isTrue); // 스트림 대기 중
      // 아무 bot_delta/bot_done도 안 온 채 45초 경과 → DB 정본에서 복구.
      async.elapse(const Duration(milliseconds: 45000));
      async.flushMicrotasks();
      expect(c.state.botThinking, isFalse);
      expect(repo.fetchCalls, contains('t1')); // reconcile 호출
      expect(c.state.items.any((i) => i.content == 'DB에 저장된 봇 답'), isTrue);
    });
  });

  test('[CHAT-STREAM-01] bot_done(성공)은 clearOutage로 장애를 해제한다', () async {
    final repo = _FakeRepo()
      ..messages = []
      ..sendGen = 'g1';
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    await c.send('질문');
    c.applyBotDelta('g1', 1, '답변입니다');
    c.applyBotDone(const BotDone(gen: 'g1', messageId: 'm1', routeTaken: 'rag'));
    expect(c.state.outagePhase, isNull);
  });
}
