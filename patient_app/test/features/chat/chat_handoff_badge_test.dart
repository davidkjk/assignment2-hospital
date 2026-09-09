import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/chat_models.dart';
import 'package:hospital_patient_app/features/chat/widgets/chat_handoff_badge.dart';

// #9 재설계(2026-09-08): 상태 라벨은 **헤더**(ChatHandoffHeaderStatus, LED+짧은 라벨)로 옮기고,
//   **피드 배지**(ChatHandoffBadge)는 안내 멘트 + 왼쪽 LED 점만 슬림하게. 답변 도착이면 배너를 접는다(#8).
//   Q18 규칙 유지: 배정(claim)은 숨기고, '직원 확인 중'은 실제 열람 presence(staffViewing)일 때만,
//   담당자 이름은 답변 도착에만 노출. 노출 문구는 CONNECTING_MSG 하나뿐(시간 약속 금지).
void main() {
  Future<void> pumpBadge(WidgetTester t, HandoffStatus s,
          {bool viewing = false, bool typing = false, VoidCallback? onRetry}) =>
      t.pumpWidget(MaterialApp(
          home: Scaffold(
              body: ChatHandoffBadge(
                  status: s, staffViewing: viewing, staffTyping: typing, onRetry: onRetry))));
  Future<void> pumpHeader(WidgetTester t, HandoffStatus s, {bool viewing = false}) =>
      t.pumpWidget(MaterialApp(
          home: Scaffold(
              body: ChatHandoffHeaderStatus(status: s, staffViewing: viewing))));

  // ── 헤더 상태(짧은 라벨 + LED) ──────────────────────────────────────────
  testWidgets('[#9 헤더] 인계 후 직원 열기 전이면 `직원 확인 전`', (t) async {
    await pumpHeader(t, const HandoffStatus(phase: HandoffPhase.connecting));
    expect(find.text('직원 확인 전'), findsOneWidget);
  });

  testWidgets('[#9 헤더/Q18③] 실제 열람(presence)이면 `직원 확인 중`으로 바뀐다', (t) async {
    await pumpHeader(t, const HandoffStatus(phase: HandoffPhase.connecting), viewing: true);
    expect(find.text('직원 확인 중'), findsOneWidget);
    expect(find.text('직원 확인 전'), findsNothing);
  });

  testWidgets('[#9 헤더/Q18②] 배정(connecting)이어도 담당자 이름을 노출하지 않는다', (t) async {
    await pumpHeader(t, const HandoffStatus(phase: HandoffPhase.connecting,
        assigneeName: '김간호', assigneeRole: '간호사'));
    expect(find.textContaining('김간호'), findsNothing);
  });

  testWidgets('[#9 헤더] 직원이 타이핑 중이면 `직원이 입력 중` — 확인 중/확인 전으로 안 되돌아감', (t) async {
    // 실기기 지적(2026-09-09): 직원이 답을 쓰기 시작하면 viewing presence 만료로 헤더가 `직원 확인 전`으로
    //   되돌아가 배너가 다시 뜨던 문제. 타이핑 중이면 답변 도착 전까지 `직원이 입력 중`으로 유지한다.
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: ChatHandoffHeaderStatus(
                status: const HandoffStatus(phase: HandoffPhase.connecting),
                staffViewing: false,
                staffTyping: true))));
    expect(find.text('직원이 입력 중'), findsOneWidget);
    expect(find.text('직원 확인 전'), findsNothing);
  });

  testWidgets('[#9 헤더/Q18④] 답변 도착이면 `답변 도착` + 담당자 이름', (t) async {
    await pumpHeader(t, const HandoffStatus(phase: HandoffPhase.ended,
        assigneeName: '이의사', assigneeRole: '의사'));
    expect(find.text('답변 도착'), findsOneWidget);
    expect(find.textContaining('이의사'), findsOneWidget);
  });

  testWidgets('[CHAT-HANDOFF-STATE-03 헤더] 직원 종료(closed)면 `상담 종료` — 답변 도착과 구분', (t) async {
    // 같은 phase=ended라도 closed=true면 '상담 종료'다(막다른 길 경계와 짝). 종료된 상담이라 담당자 이름은
    //   더 붙이지 않는다(대화는 끝났고, 이어서 물으면 새 AI 세션이 시작된다).
    await pumpHeader(t, const HandoffStatus(phase: HandoffPhase.ended, closed: true,
        assigneeName: '이의사', assigneeRole: '의사'));
    expect(find.text('상담 종료'), findsOneWidget);
    expect(find.text('답변 도착'), findsNothing);
    expect(find.textContaining('이의사'), findsNothing);
  });

  testWidgets('[#9 헤더] 인계 전(phase null)이면 아무것도 안 보인다', (t) async {
    await pumpHeader(t, const HandoffStatus(phase: null));
    expect(find.byType(Text), findsNothing);
  });

  // ── 피드 배지(상태별 안내 멘트 + LED, 답변 도착/타이핑이면 접힘) ───────────────
  testWidgets('[피드] 직원 확인 전이면 대기 안내(순서·소요) — 라벨은 헤더로', (t) async {
    await pumpBadge(t, const HandoffStatus(phase: HandoffPhase.connecting));
    expect(find.textContaining('순서대로 확인해서 답변드려요'), findsOneWidget);
    expect(find.textContaining('상담 직원과 연결이 되었어요'), findsNothing); // 아직 연결 전
    expect(find.text('직원 확인 전'), findsNothing); // 라벨은 헤더 담당
    expect(find.textContaining('분 후'), findsNothing); // 예상시간 지어내지 않음
    expect(find.textContaining('접수'), findsNothing);  // 접수/등록 약속 금지
  });

  testWidgets('[피드] 직원 확인 중(실열람)이면 `상담 직원과 연결이 되었어요`', (t) async {
    await pumpBadge(t, const HandoffStatus(phase: HandoffPhase.connecting), viewing: true);
    expect(find.textContaining('상담 직원과 연결이 되었어요'), findsOneWidget);
    expect(find.textContaining('순서대로 확인해서 답변드려요'), findsNothing); // 대기 안내는 사라짐
  });

  testWidgets('[피드] 직원이 타이핑 중이면 배너를 숨긴다', (t) async {
    await pumpBadge(t, const HandoffStatus(phase: HandoffPhase.connecting),
        viewing: true, typing: true);
    expect(find.textContaining('상담 직원과 연결이 되었어요'), findsNothing);
    expect(find.textContaining('순서대로 확인해서 답변드려요'), findsNothing);
  });

  testWidgets('[#8 피드] 답변 도착이면 배너를 접는다 — 안내 멘트가 사라진다', (t) async {
    await pumpBadge(t, const HandoffStatus(phase: HandoffPhase.ended,
        assigneeName: '이의사', assigneeRole: '의사'));
    expect(find.textContaining('순서대로 확인해서 답변드려요'), findsNothing);
    expect(find.textContaining('상담 직원과 연결이 되었어요'), findsNothing);
    expect(find.text('답변 도착'), findsNothing); // 답변 도착 표시는 헤더가 맡는다
  });

  testWidgets('[CHAT-HANDOFF-HOURS-01] 운영시간 안이면 서버 문구만 — 예상시간 지어내지 않음', (t) async {
    await pumpBadge(t, const HandoffStatus(phase: HandoffPhase.connecting,
        isOpen: true, hoursNote: '진료시간 안에 순서대로 답변드립니다'));
    expect(find.text('진료시간 안에 순서대로 답변드립니다'), findsOneWidget);
    expect(find.textContaining('분 후'), findsNothing);
  });

  testWidgets('[CHAT-HANDOFF-HOURS-02] 운영시간 밖이면 다음 영업일 답변 안내', (t) async {
    await pumpBadge(t, const HandoffStatus(phase: HandoffPhase.connecting,
        isOpen: false, hoursNote: '진료시간이 아니라 다음 영업일에 답변드립니다'));
    expect(find.textContaining('다음 영업일'), findsOneWidget);
  });

  testWidgets('[CHAT-HANDOFF-LOAD-01] 이전 상태가 없으면 로딩 — 대기/완료를 추측하지 않는다', (t) async {
    await pumpBadge(t, const HandoffStatus(phase: null));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('[CHAT-HANDOFF-ERR-01] 조회 실패면 오류+재시도 — 완료로 안 바꿈', (t) async {
    await pumpBadge(t, const HandoffStatus(phase: null, loadError: true), onRetry: () {});
    expect(find.text('다시 시도'), findsOneWidget);
  });
}
