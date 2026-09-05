import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/booking/booking_controller.dart';
import 'package:hospital_patient_app/features/booking/catalog_repository.dart';
import 'package:hospital_patient_app/features/booking/steps/date_step.dart';
import 'booking_test_support.dart';

Future<void> pumpCal(WidgetTester t,
    {required Set<DateTime> available,
    required DateTime now,
    required void Function(DateTime) onPick}) async {
  await t.pumpWidget(MaterialApp(
    theme: AppTheme.theme,
    home: Scaffold(
      body: SingleChildScrollView(
        child: MonthCalendar(available: available, now: now, onPick: onPick),
      ),
    ),
  ));
  await t.pumpAndSettle();
}

void main() {
  testWidgets('[BOOK-DATE-01] 월 단위 달력 — 월 헤더 + 요일 머리글 + 날짜 격자', (t) async {
    await pumpCal(t, available: {DateTime(2026, 8, 20)}, now: DateTime(2026, 8, 10), onPick: (_) {});
    expect(find.textContaining('2026년 8월'), findsOneWidget);
    expect(find.text('일'), findsOneWidget);
    expect(find.text('토'), findsOneWidget); // 요일 머리글
  });

  testWidgets('[BOOK-DATE-02][BOOK-DATE-03] 가능한 날은 테두리로 눌리고, 그 밖의 날은 흐린 숫자로 못 누른다', (t) async {
    DateTime? picked;
    await pumpCal(t,
        available: {DateTime(2026, 8, 20)}, now: DateTime(2026, 8, 10), onPick: (d) => picked = d);
    await t.tap(find.text('21')); // 진료 없는 날
    await t.pump();
    expect(picked, isNull); // 못 누른다(숨기지 않고 흐리게)
    await t.tap(find.text('20'));
    await t.pump();
    expect(picked, DateTime(2026, 8, 20)); // 가능일은 눌린다
  });

  testWidgets('[BOOK-DATE-04][BOOK-DATE-05] 하단 범례는 예약 가능 / 진료 없음 둘뿐(휴진·마감·꽉참을 묶는다)', (t) async {
    await pumpCal(t, available: {DateTime(2026, 8, 20)}, now: DateTime(2026, 8, 10), onPick: (_) {});
    expect(find.text('예약 가능'), findsOneWidget);
    expect(find.text('진료 없음'), findsOneWidget);
    expect(find.text('휴진'), findsNothing); // 셋을 나누지 않는다(범례 넷 금지)
  });

  testWidgets('[BOOK-DATE-06] 8주 뒤가 속한 달 이후로는 다음 달이 비활성 + 이유 한 줄', (t) async {
    // now=8/10 → 8주 뒤=10/5(10월). 8월(현재)에선 › 활성, 10월로 넘기면 비활성 + 안내.
    await pumpCal(t, available: const {}, now: DateTime(2026, 8, 10), onPick: (_) {});
    expect(find.text('예약은 8주 뒤까지 가능합니다'), findsNothing); // 8월엔 아직 안 뜬다
    await t.tap(find.byKey(const Key('cal-next'))); // → 9월
    await t.pump();
    await t.tap(find.byKey(const Key('cal-next'))); // → 10월(호라이즌 월)
    await t.pump();
    expect(find.text('예약은 8주 뒤까지 가능합니다'), findsOneWidget);
    final next = t.widget<IconButton>(find.byKey(const Key('cal-next')));
    expect(next.onPressed, isNull); // 다음 달 비활성
  });

  testWidgets('[BOOK-DATE-07] 이번 달에서는 이전 달 ‹가 비활성이다', (t) async {
    await pumpCal(t, available: {DateTime(2026, 8, 20)}, now: DateTime(2026, 8, 10), onPick: (_) {});
    final prev = t.widget<IconButton>(find.byKey(const Key('cal-prev')));
    expect(prev.onPressed, isNull); // 지난 날짜로 갈 이유 없음
  });

  testWidgets('[NAV-BOOK-10] DateStep에서 가능일을 누르면 5단계로(controller step=4)', (t) async {
    final today = DateTime.now();
    final d = DateTime(today.year, today.month, today.day);
    final c = await pumpBooking(t, const DateStep(),
        overrides: [availableDatesProvider(kDocPhoto.id).overrideWith((ref) async => [d])],
        target: kSelf,
        department: kInternal,
        doctor: kDocPhoto);
    await t.pumpAndSettle();
    await t.ensureVisible(find.text('${today.day}')); // 달 아래쪽 날짜면 스크롤해 보이게
    await t.pumpAndSettle();
    await t.tap(find.text('${today.day}'));
    await t.pump();
    expect(c.read(bookingProvider).step, 4); // 5단계 화면은 Task 20
    expect(c.read(bookingProvider).date, d);
  });
}
