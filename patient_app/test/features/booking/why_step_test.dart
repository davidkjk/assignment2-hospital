import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/booking/booking_controller.dart';
import 'package:hospital_patient_app/features/booking/steps/why_step.dart';
import 'booking_test_support.dart';

Future<ProviderContainer> pumpWhy(WidgetTester t) async {
  final c = await pumpBooking(t, const WhyStep(), target: kSelf);
  await t.pumpAndSettle();
  return c;
}

void main() {
  testWidgets('[BOOK-WHY-01] 자유 입력 한 칸(자주 쓰는 이유 단추 없음)', (t) async {
    await pumpWhy(t);
    expect(find.byType(TextField), findsOneWidget);
    expect(find.byType(ChoiceChip), findsNothing);
  });

  testWidgets('[BOOK-WHY-02] 질문 문구와 부연', (t) async {
    await pumpWhy(t);
    expect(find.text('어떤 일로 오시나요?'), findsOneWidget);
    expect(find.text('간단히 적어주시면 진료 준비에 도움이 됩니다.'), findsOneWidget);
  });

  testWidgets('[BOOK-WHY-03] 필수가 아니다 — 건너뛰기가 7단계로 보낸다', (t) async {
    final c = await pumpWhy(t);
    await t.tap(find.text('건너뛰기'));
    await t.pump();
    expect(c.read(bookingProvider).step, 6);
    expect(c.read(bookingProvider).reason, '');
  });

  testWidgets('[BOOK-WHY-04] 문진 초기값 안내 상자', (t) async {
    await pumpWhy(t);
    expect(find.textContaining('사전문진의 첫 문항에 그대로 옮겨져'), findsOneWidget);
  });

  testWidgets('[BOOK-WHY-05] 100자에 도달하면 입력을 막고 100/100을 보인다(잘라내지 않음)', (t) async {
    await pumpWhy(t);
    await t.enterText(find.byType(TextField), 'ㄱ' * 120);
    await t.pump();
    expect(find.text('100/100'), findsOneWidget); // maxLength가 입력을 막는다
  });

  testWidgets('[BOOK-WHY-01] 다음은 적은 이유를 담아 7단계로 보낸다', (t) async {
    final c = await pumpWhy(t);
    await t.enterText(find.byType(TextField), '감기 기운');
    await t.tap(find.text('다음'));
    await t.pump();
    expect(c.read(bookingProvider).reason, '감기 기운');
    expect(c.read(bookingProvider).step, 6);
  });
}
