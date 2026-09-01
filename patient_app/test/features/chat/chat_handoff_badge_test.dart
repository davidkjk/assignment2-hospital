import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/chat_models.dart';
import 'package:hospital_patient_app/features/chat/widgets/chat_handoff_badge.dart';

void main() {
  Future<void> pump(WidgetTester t, HandoffStatus s) =>
      t.pumpWidget(MaterialApp(home: Scaffold(body: ChatHandoffBadge(status: s))));

  testWidgets('[CHAT-HANDOFF-STATE-01] 티켓 생성·담당 대기면 `직원 연결 중`', (t) async {
    await pump(t, const HandoffStatus(phase: HandoffPhase.connecting));
    expect(find.text('직원 연결 중'), findsOneWidget);
  });

  testWidgets('[CHAT-HANDOFF-STATE-02] 담당 배정이면 `직원 상담 중` + 담당자 이름·역할', (t) async {
    await pump(t, const HandoffStatus(phase: HandoffPhase.inProgress,
        assigneeName: '김간호', assigneeRole: '간호사'));
    expect(find.text('직원 상담 중'), findsOneWidget);
    expect(find.textContaining('김간호'), findsOneWidget);
    expect(find.textContaining('간호사'), findsOneWidget);
  });

  testWidgets('[CHAT-ROOM-LIVE-STAFF-01] 담당자는 서버 확정 현재 한 명만 — 배정 경쟁/이관 이력을 그리지 않는다', (t) async {
    // A안 확정: 정착된 결과만. 재배정되면 이름을 교체할 뿐 "이관 중" 중간 상태를 만들지 않는다.
    await pump(t, const HandoffStatus(phase: HandoffPhase.inProgress,
        assigneeName: '이의사', assigneeRole: '의사'));
    expect(find.textContaining('이의사'), findsOneWidget);
    expect(find.textContaining('이관'), findsNothing);   // 이관 진행/이력 없음
    expect(find.textContaining('경쟁'), findsNothing);
  });

  testWidgets('[CHAT-HANDOFF-STATE-03] 직원 종료면 `상담 종료`', (t) async {
    await pump(t, const HandoffStatus(phase: HandoffPhase.ended));
    expect(find.text('상담 종료'), findsOneWidget);
  });

  testWidgets('[CHAT-HANDOFF-HOURS-01] 운영시간 안이면 운영시간 안 안내 — 예상시간 지어내지 않음', (t) async {
    await pump(t, const HandoffStatus(phase: HandoffPhase.connecting,
        isOpen: true, hoursNote: '진료시간 안에 순서대로 답변드립니다'));
    expect(find.text('진료시간 안에 순서대로 답변드립니다'), findsOneWidget);
    expect(find.textContaining('분 후'), findsNothing); // 서버가 안 준 예상시간 금지
  });

  testWidgets('[CHAT-HANDOFF-HOURS-02] 운영시간 밖이면 다음 영업일 답변 안내', (t) async {
    await pump(t, const HandoffStatus(phase: HandoffPhase.connecting,
        isOpen: false, hoursNote: '진료시간이 아니라 다음 영업일에 답변드립니다'));
    expect(find.textContaining('다음 영업일'), findsOneWidget);
  });

  testWidgets('[CHAT-HANDOFF-LOAD-01] 이전 상태가 없으면 로딩 — 대기/완료를 추측하지 않는다', (t) async {
    await pump(t, const HandoffStatus(phase: null)); // 조회 전
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text('상담 종료'), findsNothing);
  });

  testWidgets('[CHAT-HANDOFF-ERR-01] 조회 실패면 배지 영역에 오류+재시도 — 완료로 안 바꿈', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatHandoffBadge(
        status: const HandoffStatus(phase: null, loadError: true), onRetry: () {}))));
    expect(find.text('다시 시도'), findsOneWidget);
    expect(find.text('상담 종료'), findsNothing);
  });
}
