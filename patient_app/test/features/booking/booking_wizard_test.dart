import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/tokens.dart';
import 'package:hospital_patient_app/features/booking/booking_controller.dart';
import 'package:hospital_patient_app/features/booking/booking_wizard.dart';
import 'package:hospital_patient_app/features/booking/catalog_repository.dart';
import 'package:hospital_patient_app/features/booking/steps/dept_step.dart';
import 'package:hospital_patient_app/features/booking/steps/who_step.dart';
import 'booking_test_support.dart';

Future<ProviderContainer> pumpWizard(WidgetTester t,
    {int step = 0, BookingTarget target = kSelf}) async {
  final overrides = <Override>[
    targetsOverride([target]),
    departmentsProvider.overrideWith((ref) async => const [kInternal]),
    doctorsProvider(kInternal.id).overrideWith((ref) async => const [kDocPhoto]),
    availableDatesProvider(kDocPhoto.id).overrideWith((ref) async => const []),
  ];
  final c = await pumpBooking(t, const BookingWizard(), overrides: overrides);
  final ctl = c.read(bookingProvider.notifier);
  if (step >= 1) ctl.selectTarget(target);
  if (step >= 2) ctl.selectDepartment(kInternal);
  if (step >= 3) ctl.selectDoctor(kDocPhoto);
  await t.pumpAndSettle();
  return c;
}

void main() {
  testWidgets('[BOOK-NAV-02] 진행 표시는 숫자와 단계 이름을 함께 쓴다', (t) async {
    await pumpWizard(t, step: 0);
    // 데모 구조: 딥틸 밴드엔 단계 이름, 아래 회색 띠엔 'N단계 / 8단계' — 둘 다 화면에 함께 보인다.
    expect(find.text('대상 선택'), findsOneWidget);
    expect(find.text('1단계 / 8단계'), findsOneWidget);
  });

  testWidgets('[BOOK-NAV-03][BOOK-NAV-04] 뒤로 버튼 하나로 한 단계씩 되돌아간다', (t) async {
    final c = await pumpWizard(t, step: 2);
    expect(find.byType(BackButtonIcon), findsOneWidget); // 하나만
    await t.tap(find.byType(BackButtonIcon));
    await t.pump();
    expect(c.read(bookingProvider).step, 1); // 마법사를 나가지 않고 한 단계
  });

  testWidgets('[BOOK-NAV-06] 2단계부터 고른 값이 읽기 전용 회색 딱지로 보인다', (t) async {
    await pumpWizard(t, step: 1, target: kSelf);
    final chip = t.widget<Chip>(find.byType(Chip));
    expect(chip.backgroundColor, AppTokens.muted); // 버튼 아님(onPressed 없음)
    expect(find.text('김순자'), findsWidgets);
  });

  testWidgets('[BOOK-KEEP-05] 1단계에서 뒤로 누르면 확인창 없이 마법사를 나간다', (t) async {
    await pumpWizard(t, step: 0);
    await t.tap(find.byType(BackButtonIcon));
    await t.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing); // 팝업 없음(대상 하나뿐이라)
    expect(wentTo('home'), isTrue); // 마법사 밖(예약은 탭이라 홈으로)
  });

  testWidgets('[BOOK-NAV-01] 마법사는 한 화면에 한 질문 = 단계별 하나의 스텝 위젯만 보인다', (t) async {
    await pumpWizard(t, step: 0);
    expect(find.byType(WhoStep), findsOneWidget);
    expect(find.byType(DeptStep), findsNothing);
  });
}
