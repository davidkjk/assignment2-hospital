import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/booking/booking_controller.dart';
import 'package:hospital_patient_app/features/booking/catalog_repository.dart';
import 'package:hospital_patient_app/features/booking/steps/time_step.dart';
import 'booking_test_support.dart';

Slot _slot(String hhmm, DateTime d) {
  final p = hhmm.split(':');
  return Slot('s-$hhmm', DateTime(d.year, d.month, d.day, int.parse(p[0]), int.parse(p[1])));
}

Future<ProviderContainer> pumpTime(WidgetTester t,
    {required List<Slot> slots, DateTime? date}) async {
  final base = date ?? DateTime(2026, 8, 20);
  final d = DateTime(base.year, base.month, base.day);
  final c = await pumpBooking(t, const TimeStep(),
      overrides: [
        availableSlotsProvider((doctorId: kDocPhoto.id, date: d)).overrideWith((ref) async => slots),
      ],
      target: kSelf,
      department: kInternal,
      doctor: kDocPhoto,
      date: d);
  await t.pumpAndSettle();
  return c;
}

void main() {
  final d = DateTime(2026, 8, 20);

  testWidgets('[BOOK-TIME-01][BOOK-TIME-03] 오전/오후 덩어리 + 남은 자리 수', (t) async {
    await pumpTime(t, slots: [_slot('09:00', d), _slot('09:20', d), _slot('14:00', d)]);
    expect(find.text('오전 · 2자리'), findsOneWidget);
    expect(find.text('오후 · 1자리'), findsOneWidget);
  });

  testWidgets('[BOOK-TIME-02] 찬 시간은 회색이 아니라 아예 없다(서버 목록에 없음)', (t) async {
    await pumpTime(t, slots: [_slot('09:00', d)]); // 서버가 빈시간만 준다
    expect(find.text('9:20'), findsNothing); // 찬 09:20은 목록에 아예 없다
  });

  testWidgets('[BOOK-TIME-06] 오후가 0이면 오후 덩어리를 통째로 감춘다', (t) async {
    await pumpTime(t, slots: [_slot('09:00', d)]);
    expect(find.textContaining('오후'), findsNothing);
  });

  testWidgets('[BOOK-TIME-05] 시각 레일이 아니라 격자다', (t) async {
    await pumpTime(t, slots: [_slot('09:00', d), _slot('09:20', d)]);
    expect(find.byType(GridView), findsWidgets); // 3열 격자
  });

  testWidgets('[NAV-BOOK-11][BOOK-TIME-04] 시각을 누르면 6단계 방문 이유로 간다', (t) async {
    final c = await pumpTime(t, slots: [_slot('09:00', d)]);
    await t.tap(find.text('09:00')); // slotLabel은 24시간제 HH:mm(데모 mock '09:00' 정본)
    await t.pump();
    expect(c.read(bookingProvider).step, 5);
    expect(c.read(bookingProvider).slotId, 's-09:00');
  });

  testWidgets('[BOOK-TIME-07] 그날이 전부 차면 [다른 날짜 고르기]로 4단계로 나간다', (t) async {
    final c = await pumpTime(t, slots: []);
    expect(find.text('다른 날짜 고르기'), findsOneWidget);
    await t.tap(find.text('다른 날짜 고르기'));
    await t.pump();
    expect(c.read(bookingProvider).step, 3); // NAV-BOOK-12
  });

  testWidgets('[BOOK-TODAY-01] 당일(오늘)을 골라도 시간 목록을 보여준다', (t) async {
    final today = DateTime.now();
    await pumpTime(t, slots: [_slot('23:30', DateTime(today.year, today.month, today.day))],
        date: today);
    expect(find.textContaining('오후'), findsOneWidget); // 오늘도 예약 화면이 뜬다
  });

  testWidgets('[BOOK-TODAY-13] 오늘 남은 시간이 0이면 30분 안내문 + 다른 날짜 출구', (t) async {
    await pumpTime(t, slots: [], date: DateTime.now());
    expect(find.text('지금 시각 기준으로 30분 뒤부터 예약하실 수 있습니다'), findsOneWidget);
    expect(find.text('다른 날짜 고르기'), findsOneWidget);
  });
}
