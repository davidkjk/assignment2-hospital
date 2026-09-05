import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/widgets/patient_app_bar.dart';

// 데모 ScreenHeader(딥틸 밴드·촘촘한 화살표–제목)를 옮긴 공통 앱바의 계약 테스트.
// 특히 뒤로/닫기 버튼의 실제 터치영역이 Android 최소 48dp를 지키는지 검증한다(코드리뷰 #4).

// 뒤로 버튼이 뜨도록(canPop=true) 2차 화면을 push한 상태를 만든다.
Future<void> _pumpSecondary(WidgetTester t, {List<Widget>? actions}) async {
  final nav = GlobalKey<NavigatorState>();
  await t.pumpWidget(MaterialApp(
    navigatorKey: nav,
    theme: AppTheme.theme,
    home: const Scaffold(body: SizedBox.shrink()),
  ));
  nav.currentState!.push(MaterialPageRoute(
    builder: (_) => Scaffold(
      appBar: PatientAppBar(title: '상세', actions: actions),
      body: const SizedBox.shrink(),
    ),
  ));
  await t.pumpAndSettle();
}

void main() {
  testWidgets('[CODE-REVIEW-4] 뒤로 버튼 터치영역은 Android 최소 48dp(폭·높이) 이상', (t) async {
    await _pumpSecondary(t);
    final size = t.getSize(find.byType(BackButton));
    expect(size.width, greaterThanOrEqualTo(48.0),
        reason: 'leadingWidth 44는 48dp 미만 — 되돌리지 말 것');
    expect(size.height, greaterThanOrEqualTo(48.0));
  });

  testWidgets('[CODE-REVIEW-4] 2차 화면 앱바가 Android 터치영역 가이드라인을 통과', (t) async {
    final handle = t.ensureSemantics();
    await _pumpSecondary(t, actions: [
      IconButton(icon: const Icon(AppIcons.notifications), onPressed: () {}),
    ]);
    await expectLater(t, meetsGuideline(androidTapTargetGuideline));
    handle.dispose();
  });

  testWidgets('화살표–제목은 데모처럼 촘촘히 붙는다(제목 왼쪽 ≤ 46px)', (t) async {
    // leadingWidth 48 + titleSpacing -4 → 제목은 44px에서 시작(옛 44+0과 동일 위치).
    await _pumpSecondary(t);
    final titleLeft = t.getTopLeft(find.text('상세')).dx;
    expect(titleLeft, lessThanOrEqualTo(46.0),
        reason: '화살표와 제목이 Material 기본(72px)처럼 벌어지면 안 된다');
  });

  testWidgets('최상위 탭(아이콘+제목, 뒤로버튼 없음)은 아이콘을 제목 왼쪽에 붙인다', (t) async {
    await t.pumpWidget(MaterialApp(
      theme: AppTheme.theme,
      home: const Scaffold(
        appBar: PatientAppBar(title: '나의 예약', icon: AppIcons.calendar_month),
        body: SizedBox.shrink(),
      ),
    ));
    expect(find.byIcon(AppIcons.calendar_month), findsOneWidget);
    expect(find.text('나의 예약'), findsOneWidget);
  });
}
