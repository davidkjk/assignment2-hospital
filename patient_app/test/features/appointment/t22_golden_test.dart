import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/appointment/appointment_actions.dart';
import 'package:hospital_patient_app/features/appointment/cancel_flow.dart';
import 'package:hospital_patient_app/features/appointment/change_flow.dart';
import 'package:hospital_patient_app/features/appointment/reject_banner.dart';
import 'package:hospital_patient_app/features/booking/catalog_repository.dart';
import 'package:hospital_patient_app/features/booking/steps/time_step.dart' show availableSlotsProvider;
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/home/home_data.dart' show homeAppointmentsProvider;

import 'flow_harness.dart' show FakeAppointmentActions;
import 'harness.dart';

// 골든 게이트(핸드오프 정본): 데모 demo/src/routes/patient/appt/{ApptChange,ApptDetail}.tsx 눈대조용.
// T22 새 화면·팝업(변경 마법사·취소 확인창·마감 안내·반려 배너)을 PNG로 남긴다.

final _theDate = DateTime(2030, 5, 20);
final _slots = [
  Slot('s-9', DateTime(2030, 5, 20, 9, 0)),
  Slot('s-930', DateTime(2030, 5, 20, 9, 30)),
  Slot('s-16', DateTime(2030, 5, 20, 16, 0)),
];

Future<void> _shoot(WidgetTester t, String name, Widget child, {List<Override> overrides = const []}) async {
  await t.binding.setSurfaceSize(const Size(390, 844));
  addTearDown(() => t.binding.setSurfaceSize(null));
  await t.pumpWidget(ProviderScope(
    overrides: overrides,
    child: MaterialApp(theme: AppTheme.theme, home: child),
  ));
  await t.pumpAndSettle();
  await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/t22-$name.png'));
}

void main() {
  setUpAll(() async {
    final f = File('/System/Library/Fonts/Supplemental/AppleGothic.ttf');
    if (f.existsSync()) {
      final loader = FontLoader('Roboto')
        ..addFont(Future.value(f.readAsBytesSync().buffer.asByteData()));
      await loader.load();
    }
  });

  final d = detail(slot: DateTime(2030, 5, 20, 14, 30), reason: '오른쪽 무릎이 아파요');

  testWidgets('t22 cancel confirm dialog golden', (t) async {
    await _shoot(t, 'cancel-confirm', Scaffold(body: Center(child: CancelConfirmDialog(d))));
  });

  testWidgets('t22 late support dialog golden', (t) async {
    await _shoot(t, 'late-support', Scaffold(body: Center(child: LateSupportDialog(d))),
        overrides: [appointmentActionsProvider.overrideWithValue(FakeAppointmentActions())]);
  });

  testWidgets('t22 reject banner golden', (t) async {
    final rd = detail(cancelRejectedAt: DateTime(2030, 5, 18), cancelRejectedReason: '진료 준비가 이미 진행되었습니다');
    await _shoot(
        t, 'reject-banner', Scaffold(body: Padding(padding: const EdgeInsets.all(20), child: CancelRejectBanner(rd))),
        overrides: [appointmentActionsProvider.overrideWithValue(FakeAppointmentActions())]);
  });

  testWidgets('t22 change notice banner golden', (t) async {
    final cd = detail(
      slot: DateTime(2030, 5, 20, 16, 0),
      hospitalChangePrevTime: DateTime(2030, 5, 20, 14, 30),
      hospitalChangeKind: 'changed',
    );
    await _shoot(t, 'change-notice',
        Scaffold(body: Padding(padding: const EdgeInsets.all(20), child: ChangeNoticeBanner(cd))),
        overrides: [appointmentActionsProvider.overrideWithValue(FakeAppointmentActions())]);
  });

  testWidgets('t22 change time step golden', (t) async {
    final cd = detail(slot: DateTime(2030, 5, 20, 14, 30), dept: '정형외과', doctor: '김의사');
    final router = GoRouter(initialLocation: '/change', routes: [
      GoRoute(path: '/change', builder: (c, s) => Scaffold(body: ChangeWizard(cd))),
    ]);
    await t.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => t.binding.setSurfaceSize(null));
    await t.pumpWidget(ProviderScope(
      overrides: [
        appointmentActionsProvider.overrideWithValue(FakeAppointmentActions()),
        availableSlotsProvider((doctorId: cd.doctorId!, date: _theDate)).overrideWith((ref) async => _slots),
        homeAppointmentsProvider.overrideWith((ref) async => <AppointmentView>[]),
      ],
      child: MaterialApp.router(theme: AppTheme.theme, routerConfig: router),
    ));
    await t.pumpAndSettle();
    // 시간 단계로 진입(날짜 달력은 now-의존이라 골든에서 제외).
    final container = ProviderScope.containerOf(t.element(find.byType(ChangeWizard)));
    final args = (appointmentId: cd.view.id, doctorId: cd.doctorId ?? '', doctorName: cd.view.doctorName);
    container.read(changeControllerProvider(args).notifier).selectDate(_theDate);
    await t.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/t22-change-time.png'));
  });
}
