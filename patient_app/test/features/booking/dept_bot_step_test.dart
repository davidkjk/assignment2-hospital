import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/booking/booking_controller.dart';
import 'package:hospital_patient_app/features/booking/catalog_repository.dart';
import 'package:hospital_patient_app/features/booking/steps/dept_bot_sheet.dart';
import 'booking_test_support.dart';

Future<ProviderContainer> pumpSheet(WidgetTester t,
    {Department? suggested, BookingTarget target = kSelf}) async {
  final container = ProviderContainer(overrides: [
    if (suggested != null) deptBotSuggestionProvider.overrideWithValue(suggested),
  ]);
  addTearDown(container.dispose);
  container.read(bookingProvider.notifier).selectTarget(target);
  await t.pumpWidget(UncontrolledProviderScope(
    container: container,
    child: MaterialApp(
      theme: AppTheme.theme,
      home: Scaffold(
        body: Builder(
          builder: (ctx) => Center(
            child: ElevatedButton(
              onPressed: () => showModalBottomSheet(
                  context: ctx, isScrollControlled: true, builder: (_) => const DeptBotSheet()),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ),
  ));
  await t.tap(find.text('open'));
  await t.pumpAndSettle();
  return container;
}

void main() {
  testWidgets('[BOOK-BOT-01] 시트는 겹침(화면을 떠나지 않는다) — 아래에서 올라온다', (t) async {
    await pumpSheet(t);
    expect(find.byType(DeptBotSheet), findsOneWidget);
    expect(find.text('open'), findsOneWidget); // 뒤 화면이 살아 있다
  });

  testWidgets('[BOOK-BOT-02] 제목은 "AI 상담봇"(챗봇 아님)', (t) async {
    await pumpSheet(t);
    expect(find.text('AI 상담봇'), findsOneWidget);
    expect(find.textContaining('챗봇'), findsNothing);
  });

  testWidgets('[BOOK-BOT-03] 오른쪽 위 원형 X(40px)로 닫는다', (t) async {
    await pumpSheet(t);
    final btn = t.widget<IconButton>(find.widgetWithIcon(IconButton, AppIcons.cancel));
    expect(btn.iconSize, 40);
  });

  testWidgets('[BOOK-BOT-04][BOOK-BOT-05] 과가 정해지면 ○○과로 계속하기 + 진행 중 보조 문구', (t) async {
    final c = await pumpSheet(t, suggested: kInternal);
    expect(find.text('내과로 계속하기'), findsOneWidget);
    expect(find.textContaining('예약을 계속 진행 중입니다'), findsOneWidget);
    await t.tap(find.text('내과로 계속하기'));
    await t.pumpAndSettle();
    expect(c.read(bookingProvider).department!.id, 'd1'); // NAV-BOOK-07 그 과 선택된 채 3단계
    expect(c.read(bookingProvider).step, 2);
  });

  testWidgets('[BOOK-BOT-06] 그냥 닫으면 아무것도 고르지 않은 2단계 그대로', (t) async {
    final c = await pumpSheet(t); // suggested 없음
    await t.tap(find.widgetWithIcon(IconButton, AppIcons.cancel));
    await t.pumpAndSettle();
    expect(c.read(bookingProvider).department, isNull);
  });
}
