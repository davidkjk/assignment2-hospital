import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/tokens.dart';
import 'package:hospital_patient_app/widgets/action_button.dart';

FilledButton _btn(WidgetTester t) =>
    t.widget<FilledButton>(find.byType(FilledButton));

Color _bg(WidgetTester t) =>
    _btn(t).style!.backgroundColor!.resolve({}) as Color;

void main() {
  // BTN-STATE-02는 "회색으로 칠하지 않는다"가 핵심 — 처리 중 색이 회색 계열이 아님을 못박는다.
  test('[BTN-STATE-02] 처리 중 색은 회색 두 토큰 어느 것도 아니다(흐린 딥틸)', () {
    expect(AppTokens.primaryBusy == AppTokens.grayPending, isFalse);
    expect(AppTokens.primaryBusy == AppTokens.grayDone, isFalse);
  });

  testWidgets('[BTN-SCOPE-01] 서버를 바꾸는 버튼을 누르면 onPressed가 실행된다', (t) async {
    var tapped = false;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ActionButton(
      label: '예약 신청하기', busyLabel: '예약 신청 중…',
      onPressed: () => tapped = true))));
    await t.tap(find.byType(FilledButton));
    expect(tapped, isTrue);
  });

  testWidgets('[BTN-SCOPE-02] 읽기 전용 버튼이 아님 — 상태(busyLabel)를 반드시 요구한다', (t) async {
    // ActionButton은 busyLabel이 required다. 조회·이동 버튼(상태 없음)은 이 위젯을 쓰지 않는다.
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ActionButton(
      label: '예약 신청하기', busyLabel: '예약 신청 중…', onPressed: () {}))));
    expect(find.text('예약 신청하기'), findsOneWidget); // 평소 라벨
  });

  testWidgets('[BTN-BUSY-01] 처리 중에도 글자를 지우지 않고 진행형으로 바꾼다', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ActionButton(
      label: '예약 신청하기', busyLabel: '예약 신청 중…', busy: true, onPressed: () {}))));
    expect(find.text('예약 신청 중…'), findsOneWidget);
    expect(find.text('예약 신청하기'), findsNothing);
  });

  testWidgets('[BTN-BUSY-02] 처리 중 다시 누르면 무시한다', (t) async {
    var count = 0;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ActionButton(
      label: '신청', busyLabel: '신청 중…', busy: true, onPressed: () => count++))));
    await t.tap(find.byType(FilledButton));
    expect(count, 0);
  });

  testWidgets('[BTN-STATE-01] 평소 배경은 진한 딥틸(primary)', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ActionButton(
      label: '신청', busyLabel: '신청 중…', onPressed: () {}))));
    expect(_bg(t), AppTokens.primary);
  });

  testWidgets('[BTN-STATE-02] 처리 중 배경은 흐린 딥틸(primaryBusy)', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ActionButton(
      label: '신청', busyLabel: '신청 중…', busy: true, onPressed: () {}))));
    expect(_bg(t), AppTokens.primaryBusy);
  });

  testWidgets('[BTN-STATE-03] 비활성이면 회색 + 이유 문구를 함께 보여준다', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ActionButton(
      label: '변경하기', busyLabel: '변경 중…', onPressed: () {},
      disabledReason: '오프라인 상태에서는 변경할 수 없습니다'))));
    expect(_bg(t), AppTokens.grayDone);                       // 회색
    expect(find.text('오프라인 상태에서는 변경할 수 없습니다'), findsOneWidget); // 이유 문구
  });

  testWidgets('[BTN-TIME-01] 앱은 스스로 타임아웃을 걸지 않는다 — busy는 외부가 풀 때까지 유지', (t) async {
    var count = 0;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ActionButton(
      label: '신청', busyLabel: '신청 중…', busy: true, onPressed: () => count++))));
    await t.pump(const Duration(minutes: 5)); // 5분 지나도
    await t.tap(find.byType(FilledButton));
    expect(count, 0);                          // 여전히 무시(자동 해제 없음)
    expect(find.text('신청 중…'), findsOneWidget);
  });
}
