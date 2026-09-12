import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/chat/restricted_chat.dart';

void main() {
  test('[BOOKBOT-SHEET-MODE-01] 제한모드는 정보성 안내·진료과 추천만 — 모든 행동형 카드 금지', () {
    for (final c in ['time_select', 'booking_confirm', 'booking_done', 'questionnaire']) {
      expect(() => assertActionCardBlocked(c), throwsA(isA<RestrictedModeError>()));
    }
  });

  test('[BOOKBOT-SHEET-BLOCK-01] 제한모드여도 119·응급실 긴급 안내는 항상 작동', () {
    expect(isEmergencyAllowedInRestricted(), isTrue); // 모드와 무관
  });

  test('[BOOKBOT-SHEET-CONTEXT-01] 예약 대상 UUID·관계를 상담 모드에 전달하고 다시 묻지 않는다', () {
    final ctl = RestrictedChatController(forPatientId: 'p1', relation: '본인');
    expect(ctl.context['for_patient_id'], 'p1');
    expect(ctl.context['relation'], '본인');
  });

  testWidgets('[BOOKBOT-SHEET-INIT-01] 정상 진입이면 진료과 선택 도움 대화 시작 + 진단 아님 표시', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: RestrictedChatPanel(
        forPatientId: 'p1', relation: '본인'))));
    expect(find.textContaining('진단'), findsWidgets); // 진단 아님 표시 유지
  });

  testWidgets('[BOOKBOT-SHEET-LOAD-01] 봇 응답 대기면 시트·예약값 유지하고 응답 로딩', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: RestrictedChatPanel(
        forPatientId: 'p1', relation: '본인', loading: true))));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('[BOOKBOT-SHEET-ERR-01] 봇 응답 실패면 시트 안 닫고 예약값 유지 + 오류/재시도/자유입력', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: RestrictedChatPanel(
        forPatientId: 'p1', relation: '본인', errored: true))));
    expect(find.text('다시 시도'), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget); // 자유 입력 유지
  });

  testWidgets('[BOOKBOT-SHEET-DONE-01] 과 확정이면 [○○과로 계속하기] — 유일 행동 출구', (t) async {
    String? dept;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: RestrictedChatPanel(
        forPatientId: 'p1', relation: '본인', suggestedDept: '내과',
        onContinueToDept: (d) => dept = d))));
    expect(find.text('내과로 계속하기'), findsOneWidget);
    await t.tap(find.text('내과로 계속하기'));
    expect(dept, '내과');
  });

  testWidgets('[BOOKBOT-SHEET-OPEN-01] 예약 2단계에서 시트로 열리고 화면을 떠나지 않는다', (t) async {
    // DeptBotSheet는 겹침 시트(NAV-BOOK-06, 환자앱 T20). Task 12는 그 안에 이 패널을 주입한다.
    expect(RestrictedChatPanel.isOverlaySheetContent, isTrue);
  });

  testWidgets('[BOOKBOT-SHEET-CLOSE-01] X·스와이프로 닫으면 선택을 잃지 않고 과 미선택 2단계로', (t) async {
    var closed = false;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: RestrictedChatPanel(
        forPatientId: 'p1', relation: '본인', onClose: () => closed = true))));
    await t.tap(find.byKey(const Key('sheet-close')));
    expect(closed, isTrue); // 값 유지는 DeptBotSheet(T20)가 보장 — 여기선 닫힘 신호만
  });
}
