import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/booking/booking_controller.dart';
import 'package:hospital_patient_app/features/booking/catalog_repository.dart';
import 'package:hospital_patient_app/features/booking/steps/dept_bot_sheet.dart';
import 'package:hospital_patient_app/features/booking/steps/dept_step.dart';
import 'booking_test_support.dart';

Future<ProviderContainer> pumpDept(WidgetTester t,
    {required List<Department> depts, BookingTarget? target}) async {
  final c = await pumpBooking(t, const DeptStep(),
      overrides: [departmentsProvider.overrideWith((ref) async => depts)], target: target);
  await t.pumpAndSettle();
  return c;
}

void main() {
  testWidgets('[BOOK-DEPT-01] 진료과는 이름만 굵게 + 우측 화살표로 보인다', (t) async {
    await pumpDept(t, depts: const [kInternal]);
    final title = t.widget<Text>(find.text('내과'));
    expect(title.style!.fontWeight, FontWeight.bold);
    expect(find.byIcon(Icons.chevron_right), findsWidgets);
  });

  testWidgets('[BOOK-DEPT-02] 목록 맨 아래에 "어느 과인지 모르겠어요" 상담 진입점이 있다', (t) async {
    await pumpDept(t, depts: const [kInternal]);
    expect(find.text('어느 과인지 모르겠어요'), findsOneWidget);
  });

  testWidgets('[BOOK-DEPT-03] 진료과 0건이면 [다시 시도] 없는 빈 상태', (t) async {
    await pumpDept(t, depts: const []);
    expect(find.text('다시 시도'), findsNothing); // 실패가 아니라 사실
    expect(find.text('표시할 진료과가 없습니다'), findsOneWidget);
  });

  testWidgets('[NAV-BOOK-05] 진료과를 누르면 3단계 의사로 간다(대상 유지)', (t) async {
    final c = await pumpDept(t, depts: const [kInternal], target: kSelf);
    await t.tap(find.text('내과'));
    await t.pump();
    expect(c.read(bookingProvider).step, 2);
    expect(c.read(bookingProvider).target!.name, '김순자'); // 1단계 값 보존
  });

  testWidgets('[NAV-BOOK-06] 어느 과인지 모르겠어요는 상담봇 시트를 띄운다(화면 안 떠남)', (t) async {
    await pumpDept(t, depts: const [kInternal]);
    await t.tap(find.text('어느 과인지 모르겠어요'));
    await t.pumpAndSettle();
    expect(find.byType(DeptBotSheet), findsOneWidget); // 겹침 시트. DeptStep은 여전히 뒤에 있다
    expect(find.byType(DeptStep), findsOneWidget);
  });

  testWidgets('[NAV-BOOK-08] 시트를 닫으면 아무것도 고르지 않은 2단계 그대로', (t) async {
    final c = await pumpDept(t, depts: const [kInternal], target: kSelf);
    await t.tap(find.text('어느 과인지 모르겠어요'));
    await t.pumpAndSettle();
    await t.tap(find.text('닫기')); // ✕·쓸어내림 대역
    await t.pumpAndSettle();
    expect(c.read(bookingProvider).department, isNull); // 선택 없음
    expect(c.read(bookingProvider).step, 1); // target만 고른 채 2단계 진입 전
  });
}
