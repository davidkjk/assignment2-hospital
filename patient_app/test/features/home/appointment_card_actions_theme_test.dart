import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/home/appointment_card.dart';

import 'card_test_helpers.dart';

/// #32 회귀 테스트 — 실제 앱 테마(AppTheme.theme)에서 하단 아웃라인 버튼이 Row 안에서
/// 무한 너비로 부풀어 오버플로/클리핑되지 않는지 확인한다.
///
/// 왜 별도 셸인가: 기존 card_test_helpers.wrap()·card_gallery 골든은 모두 `theme:`를 주지 않아
/// Flutter 기본 Material 테마(OutlinedButton minWidth=64, 유한)로 렌더한다. 실기기 앱은
/// AppTheme.theme의 outlinedButtonTheme(minimumSize: Size.fromHeight(32) = 무한 minWidth)를 쓰므로
/// Row(주축 무한 제약) 안에서 각 버튼이 무한 너비가 되어 버튼이 안 보이고 빈 여백만 남았다.
Widget wrapThemed(Widget child) => MaterialApp(
      theme: AppTheme.theme,
      home: Scaffold(
        body: SingleChildScrollView(
          padding: const EdgeInsets.all(16), // 홈 화면 좌우 여백과 동일
          child: child,
        ),
      ),
    );

void main() {
  // iPhone 13 폭(390) — 실기기와 같은 좁은 폭에서 검증.
  setUp(() => TestWidgetsFlutterBinding.ensureInitialized());

  Future<void> pumpCard(WidgetTester t, Widget card) async {
    await t.binding.setSurfaceSize(const Size(390, 1200));
    addTearDown(() => t.binding.setSurfaceSize(null));
    await t.pumpWidget(wrapThemed(card));
  }

  testWidgets('[#32] 확정 카드의 시간변경/예약취소 버튼이 실제 테마에서 오버플로 없이 보인다', (t) async {
    await pumpCard(t, AppointmentCard(view: bView('예약확정')));

    // (1) 레이아웃 예외(RenderFlex overflow / 무한 크기)가 없어야 한다.
    expect(t.takeException(), isNull, reason: '실제 테마에서 하단 버튼 Row가 오버플로하면 안 된다');

    // (2) 두 버튼이 실제로 존재한다.
    expect(find.widgetWithText(OutlinedButton, '시간 변경'), findsOneWidget);
    expect(find.widgetWithText(OutlinedButton, '예약 취소'), findsOneWidget);

    // (3) 각 버튼의 렌더 너비가 유한하고 화면 폭(390) 안에 든다(무한/클리핑 아님).
    for (final label in ['시간 변경', '예약 취소']) {
      final size = t.getSize(find.widgetWithText(OutlinedButton, label));
      expect(size.width.isFinite, isTrue, reason: '$label 버튼 너비가 무한대');
      expect(size.width, lessThan(390), reason: '$label 버튼이 화면 폭을 넘김');
    }
  });

  testWidgets('[#32] 단일 아웃라인 버튼(진료완료=방문 이력 보기)도 오버플로 없이 보인다', (t) async {
    await pumpCard(t, AppointmentCard(view: bView('진료완료')));
    expect(t.takeException(), isNull);
    final size = t.getSize(find.widgetWithText(OutlinedButton, '방문 이력 보기'));
    expect(size.width.isFinite, isTrue);
    expect(size.width, lessThan(390));
  });
}
