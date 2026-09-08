import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/booking/booking_controller.dart';
import 'package:hospital_patient_app/features/booking/catalog_repository.dart';
import 'package:hospital_patient_app/features/booking/steps/who_step.dart';
import 'booking_test_support.dart';

// 결정 B: AI 상담 → 예약 마법사 인계 시 추천 진료과를 GoRouter extra로 넘긴다.
// WhoStep이 대상 선택 뒤 그 과를 자동 적용해 진료과 단계를 건너뛴다(진료과 봇 선례와 동형).
void main() {
  testWidgets('[결정B] extra로 추천 진료과가 오면 대상 선택 뒤 자동 적용 → 3단계(의사)로', (t) async {
    final container = ProviderContainer(overrides: [targetsOverride(const [kSelf])]);
    addTearDown(container.dispose);
    final router = GoRouter(
      initialLocation: '/',
      initialExtra: const Department('d1', '내과'),
      routes: [GoRoute(path: '/', builder: (c, s) => const Scaffold(body: WhoStep()))],
    );
    await t.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(routerConfig: router, theme: AppTheme.theme),
    ));
    await t.pumpAndSettle();

    await t.tap(find.text('김순자')); // 본인 선택
    await t.pump();

    final sel = container.read(bookingProvider);
    expect(sel.target, isNotNull); // 대상 선택됨
    expect(sel.department?.name, '내과'); // 추천 과 자동 적용
    expect(sel.step, 2); // 진료과 단계 건너뛰고 3단계(의사)
  });

  testWidgets('[결정B-회귀] extra가 없으면(수동/웹) 평소대로 대상만 → 2단계, 과는 비어 있다', (t) async {
    // 프리필이 일반 예약을 오염시키지 않는다는 가드.
    final c = await pumpBooking(t, const WhoStep(), overrides: [targetsOverride(const [kSelf])]);
    await t.pumpAndSettle();
    await t.tap(find.text('김순자'));
    await t.pump();
    expect(c.read(bookingProvider).department, isNull);
    expect(c.read(bookingProvider).step, 1);
  });
}
