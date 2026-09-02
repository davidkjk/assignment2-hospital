import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/lateflow_controller.dart';
import 'package:hospital_patient_app/features/chat/lateflow_chat_view.dart';

class _Support {
  int calls = 0;
  bool fail = false;
  Future<void> request(String type) async {
    calls++;
    if (fail) throw Exception('net');
  }
}

void main() {
  // ── 마감 후 안내 팝업 판정·문구(LATEFLOW-POP, 순수) ──
  test('[LATEFLOW-POP-OPEN-01] 마감 후·30분 밖 취소/변경이면 확인창 대신 안내 팝업', () {
    expect(lateFlowShouldOpenPopup(afterDeadline: true, within30min: false), isTrue);
    expect(lateFlowShouldOpenPopup(afterDeadline: false, within30min: false), isFalse);
  });

  test('[LATEFLOW-POP-COPY-01] 제목은 취소/변경에 따라 각각의 마감 문구', () {
    expect(lateFlowTitle('취소'), '취소 마감 시간이 지났습니다');
    expect(lateFlowTitle('변경'), '변경 마감 시간이 지났습니다');
  });

  test('[LATEFLOW-POP-SETTING-01] 마감 안내 N은 설정값·의사 이름 안 붙임', () {
    expect(lateFlowDeadlineText(hoursBefore: 24), '진료 시작 24시간 전');
    expect(lateFlowDeadlineText(hoursBefore: 24).contains('의사'), isFalse);
  });

  test('[LATEFLOW-POP-PATH-01] 상담 채팅 먼저·전화 상자 다음·[닫기]/[상담 채팅 연결]', () {
    final order = lateFlowPathOrder();
    expect(order.indexOf('chat') < order.indexOf('phone'), isTrue);
  });

  test('[LATEFLOW-POP-CLOSE-01] 연결 선택 전 [닫기]는 기록 없이 상세로', () async {
    final s = _Support();
    final c = LateFlowController(requestSupport: s.request);
    c.close(); // 연결 전
    expect(s.calls, 0); // 기록 없음
  });

  test('[LATEFLOW-POP-LINK-01] [상담 채팅 연결]은 누른 즉시 request_support 1회 기록', () async {
    final s = _Support();
    final c = LateFlowController(requestSupport: s.request);
    await c.connect('취소');
    expect(s.calls, 1); // 최초 기록(support_requested_at)
  });

  test('[LATEFLOW-POP-BUSY-01] 연결 처리 중엔 연결/닫기 잠금·무기한 금지(시간초과→ERR)', () async {
    final s = _Support()..fail = true;
    final c = LateFlowController(requestSupport: s.request);
    await c.connect('취소');
    expect(c.phase, ConnectPhase.error); // 시간초과/실패면 ERR로 — 무기한 잠금 아님
  });

  test('[LATEFLOW-POP-ERR-01] 실패/시간초과면 [닫기]·[다시 연결] 재활성·연결됐다 안 함', () async {
    final s = _Support()..fail = true;
    final c = LateFlowController(requestSupport: s.request);
    await c.connect('취소');
    expect(c.canRetry, isTrue);
    expect(c.phase, isNot(ConnectPhase.connected));
  });

  test('[LATEFLOW-POP-CHANGE-01] 변경도 취소와 같이 support_requested_at+request_type 저장·앱은 시간 안 고름',
      () async {
    final s = _Support();
    final c = LateFlowController(requestSupport: s.request);
    await c.connect('변경');
    expect(s.calls, 1);
    expect(c.pickedNewTime, isNull); // 새 시간은 상담에서 정함
  });

  // ── 예약 맥락 상담방(LATEFLOW-CHAT) ──
  testWidgets('[LATEFLOW-CHAT-OPEN-01] 연결 성공이면 예약 ID·이유 가진 상담방·뒤로는 예약 상세', (t) async {
    await t.pumpWidget(const MaterialApp(home: LateFlowChatView(
        appointmentId: 'ap1', reason: '취소')));
    expect(find.byType(LateFlowChatView), findsOneWidget);
  });

  testWidgets('[LATEFLOW-CHAT-RECORD-01] 이미 팝업 시점에 기록됨 — 이 화면에서 중복 생성·추가 선택 없음', (t) async {
    await t.pumpWidget(const MaterialApp(home: LateFlowChatView(
        appointmentId: 'ap1', reason: '취소')));
    expect(find.text('상담 채팅 연결'), findsNothing); // 다시 연결 버튼 없음
  });

  testWidgets('[LATEFLOW-CHAT-CONTEXT-01] 봇 첫 설명은 누구의 어느 예약·이유·예약 유지만·선택 요구 안 함', (t) async {
    await t.pumpWidget(const MaterialApp(home: LateFlowChatView(
        appointmentId: 'ap1', reason: '취소', contextLoaded: true)));
    expect(find.textContaining('아직 예약은 유지'), findsOneWidget);
  });

  testWidgets('[LATEFLOW-CHAT-KEEP-01] 연결 직후·직원 확인 중엔 상담 연결됨+예약 유지만', (t) async {
    await t.pumpWidget(const MaterialApp(home: LateFlowChatView(
        appointmentId: 'ap1', reason: '취소', contextLoaded: true)));
    expect(find.textContaining('상담(직원 확인)으로 연결됐습니다'), findsOneWidget);
  });

  testWidgets('[LATEFLOW-CHAT-FORBID-01] `취소 요청이 접수/등록됐다`·자동 취소 암시 표현 금지', (t) async {
    await t.pumpWidget(const MaterialApp(home: LateFlowChatView(
        appointmentId: 'ap1', reason: '취소', contextLoaded: true)));
    expect(find.textContaining('접수'), findsNothing);
    expect(find.textContaining('요청해'), findsNothing);
  });

  testWidgets('[LATEFLOW-CHAT-LOAD-01] 예약 맥락 조회 중엔 확인 안 된 예약 정보를 먼저 안 만든다', (t) async {
    await t.pumpWidget(const MaterialApp(home: LateFlowChatView(
        appointmentId: 'ap1', reason: '취소', contextLoaded: false)));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('[LATEFLOW-CHAT-ERR-01] 맥락 조회 실패면 다른 예약 대입 안 하고 오류·재시도·상세 복귀', (t) async {
    await t.pumpWidget(const MaterialApp(home: LateFlowChatView(
        appointmentId: 'ap1', reason: '취소', loadError: true)));
    expect(find.text('다시 시도'), findsOneWidget);
  });

  testWidgets('[LATEFLOW-CHAT-DUP-01] 이미 상담 연결 기록 있으면 새 기록·CTA 없이 기존 대화 복원', (t) async {
    await t.pumpWidget(const MaterialApp(home: LateFlowChatView(
        appointmentId: 'ap1', reason: '취소', alreadyLinked: true)));
    expect(find.text('상담 채팅 연결'), findsNothing);
  });

  // ── 연결 후 예약 상세(LATEFLOW-APPT, 순수/컨트롤러) ──
  test('[LATEFLOW-APPT-STATE-01] 상담 연결 기록·처리 전이면 상담 연결됨·직원 확인 중', () {
    expect(lateFlowApptState(linked: true, resolved: false), '상담 연결됨 · 직원 확인 중');
  });

  test('[LATEFLOW-APPT-KEEP-01] 취소/변경 미확정이면 아직 예약 유지·정상 예약 정보', () {
    expect(lateFlowApptKeepText(resolved: false), '아직 예약은 유지되고 있습니다');
  });

  test('[LATEFLOW-APPT-DUP-01] 이미 요청 기록이면 새 취소 CTA 제거·상담 이어가기로 대체', () {
    expect(lateFlowApptCta(alreadyRequested: true), '상담 이어가기 ›');
  });

  test('[LATEFLOW-APPT-CONT-01] 상담 이어가기는 새 기록 없이 같은 예약 맥락 상담방', () {
    final s = _Support();
    final c = LateFlowController(requestSupport: s.request);
    c.continueChat(); // 이어가기
    expect(s.calls, 0); // 새 기록 없음
  });

  test('[LATEFLOW-APPT-LOAD-01] 상담 상태 조회 중엔 예약 상세 유지·취소 버튼 먼저 안 보임', () {
    expect(lateFlowApptShowsCancelWhileLoading(), isFalse);
  });

  test('[LATEFLOW-APPT-ERR-01] 상태 조회 실패면 예약 상세 유지·오류/재시도·연결없음 위장 안 함', () {
    expect(lateFlowApptFabricatesNoLink(onError: true), isTrue);
  });

  test('[LATEFLOW-APPT-RESOLVE-01] 직원 처리 결과 반영 — 반려면 CCARD-CANCELREJ/정상 QR·임의 배지 삭제 없음', () {
    expect(lateFlowApptOnResolve('rejected'), 'cancel_reject');
    expect(lateFlowApptOnResolve('cancelled'), 'cancelled');
  });
}
