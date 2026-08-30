import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/booking/booking_controller.dart';
import 'package:hospital_patient_app/features/booking/booking_widgets.dart';
import 'package:hospital_patient_app/features/booking/steps/who_step.dart';
import 'booking_test_support.dart';

Future<ProviderContainer> pumpWho(WidgetTester t, {required List<BookingTarget> targets}) async {
  final c = await pumpBooking(t, const WhoStep(), overrides: [targetsOverride(targets)]);
  await t.pumpAndSettle();
  return c;
}

void main() {
  testWidgets('[BOOK-WHO-01][BOOK-WHO-03] 본인이 맨 위, 가족은 이름+관계로 나온다', (t) async {
    await pumpWho(t, targets: const [kSelf, kMom]);
    expect(find.text('김순자'), findsOneWidget);
    expect(find.text('어머니'), findsOneWidget); // 관계 표시
    final cards = t.widgetList<BookingSelectCard>(find.byType(BookingSelectCard)).toList();
    expect((cards.first.key as ValueKey<String>).value, 'target-me'); // 본인 맨 위
  });

  testWidgets('[BOOK-WHO-02] 대상을 고르면 실제 patientId가 상태에 담긴다(문자열 self 아님)', (t) async {
    final c = await pumpWho(t, targets: const [BookingTarget('uuid-1', '김순자', null)]);
    await t.tap(find.text('김순자'));
    await t.pump();
    expect(c.read(bookingProvider).target!.patientId, 'uuid-1');
    expect(c.read(bookingProvider).step, 1); // 2단계로
  });

  testWidgets('[BOOK-WHO-04] 질문 문구는 "누구의 예약인가요?"', (t) async {
    await pumpWho(t, targets: const [kSelf]);
    expect(find.text('누구의 예약인가요?'), findsOneWidget);
  });

  testWidgets('[BOOK-WHO-05][BOOK-WHO-06] 가족이 0명이어도 1단계를 건너뛰지 않고 본인 한 줄을 보여준다', (t) async {
    await pumpWho(t, targets: const [kSelf]);
    expect(find.text('누구의 예약인가요?'), findsOneWidget); // 화면이 존재(2단계부터 시작하지 않는다)
    expect(find.text('김순자'), findsOneWidget);
  });

  testWidgets('[BOOK-WHO-07][BOOK-WHO-08] 가족이 있어도 가족 추가하기가 목록 맨 아래에 항상 있다', (t) async {
    await pumpWho(t, targets: const [kSelf, kMom]);
    expect(find.text('가족 추가하기'), findsOneWidget); // 0명 한정 아님 — 막다른 길 방지
  });

  testWidgets('[BOOK-WHO-09] 가족 추가하기는 가족 탭으로 이동한다(마법사 상태는 유지)', (t) async {
    final c = await pumpWho(t, targets: const [kSelf]);
    await t.tap(find.text('가족 추가하기'));
    await t.pumpAndSettle();
    expect(wentTo('family'), isTrue);
    expect(c.read(bookingProvider).step, 0); // 마법사는 뒤에 살아 있다(BOOK-KEEP-01)
  });
}
