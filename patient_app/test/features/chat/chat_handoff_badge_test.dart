import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/chat_models.dart';
import 'package:hospital_patient_app/features/chat/widgets/chat_handoff_badge.dart';

// Q18: 환자 관점 라벨 — 배정(claim)은 숨기고, "직원이 확인 중"은 실제 열람 presence(staffViewing)일 때만.
// 담당자 이름·역할은 답변 도착(answered/ended)에만 노출. 노출 문구는 CONNECTING_MSG 하나뿐(시간 약속 금지).
void main() {
  Future<void> pump(WidgetTester t, HandoffStatus s, {bool viewing = false}) =>
      t.pumpWidget(MaterialApp(
          home: Scaffold(body: ChatHandoffBadge(status: s, staffViewing: viewing))));

  testWidgets('[Q18④] 인계 후 직원이 열기 전이면 `직원 확인 전이에요` + 연결 안내(시간 약속 없음)', (t) async {
    await pump(t, const HandoffStatus(phase: HandoffPhase.connecting));
    expect(find.text('직원 확인 전이에요'), findsOneWidget);
    expect(find.textContaining('상담(직원 확인)으로 연결됐어요'), findsOneWidget);
    expect(find.textContaining('분 후'), findsNothing); // 예상시간 지어내지 않음
    expect(find.textContaining('접수'), findsNothing);  // 접수/등록 약속 금지
  });

  testWidgets('[Q18③] 직원이 실제로 열람 중(presence)이면 `직원이 확인 중이에요`로 바뀐다', (t) async {
    await pump(t, const HandoffStatus(phase: HandoffPhase.connecting), viewing: true);
    expect(find.text('직원이 확인 중이에요'), findsOneWidget);
    expect(find.text('직원 확인 전이에요'), findsNothing);
  });

  testWidgets('[Q18②] 배정(connecting)이어도 담당자 이름·역할을 노출하지 않는다(기대만 키움 방지)', (t) async {
    await pump(t, const HandoffStatus(phase: HandoffPhase.connecting,
        assigneeName: '김간호', assigneeRole: '간호사'));
    expect(find.textContaining('김간호'), findsNothing);
    expect(find.textContaining('간호사'), findsNothing);
  });

  testWidgets('[Q18④] 답변 도착(answered)이면 `답변 도착` + 담당자 이름·역할, 연결 안내는 사라진다', (t) async {
    await pump(t, const HandoffStatus(phase: HandoffPhase.ended,
        assigneeName: '이의사', assigneeRole: '의사'));
    expect(find.text('답변 도착'), findsOneWidget);
    expect(find.textContaining('이의사'), findsOneWidget);
    expect(find.textContaining('의사'), findsOneWidget);
    expect(find.textContaining('상담(직원 확인)으로 연결됐어요'), findsNothing); // 답변 오면 안내 대신 담당자·대화
  });

  testWidgets('[CHAT-HANDOFF-HOURS-01] 운영시간 안이면 서버 문구만 — 예상시간 지어내지 않음', (t) async {
    await pump(t, const HandoffStatus(phase: HandoffPhase.connecting,
        isOpen: true, hoursNote: '진료시간 안에 순서대로 답변드립니다'));
    expect(find.text('진료시간 안에 순서대로 답변드립니다'), findsOneWidget);
    expect(find.textContaining('분 후'), findsNothing);
  });

  testWidgets('[CHAT-HANDOFF-HOURS-02] 운영시간 밖이면 다음 영업일 답변 안내', (t) async {
    await pump(t, const HandoffStatus(phase: HandoffPhase.connecting,
        isOpen: false, hoursNote: '진료시간이 아니라 다음 영업일에 답변드립니다'));
    expect(find.textContaining('다음 영업일'), findsOneWidget);
  });

  testWidgets('[CHAT-HANDOFF-LOAD-01] 이전 상태가 없으면 로딩 — 대기/완료를 추측하지 않는다', (t) async {
    await pump(t, const HandoffStatus(phase: null));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text('답변 도착'), findsNothing);
  });

  testWidgets('[CHAT-HANDOFF-ERR-01] 조회 실패면 오류+재시도 — 완료로 안 바꿈', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatHandoffBadge(
        status: const HandoffStatus(phase: null, loadError: true), onRetry: () {}))));
    expect(find.text('다시 시도'), findsOneWidget);
    expect(find.text('답변 도착'), findsNothing);
  });
}
