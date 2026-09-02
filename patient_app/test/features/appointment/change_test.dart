import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/appointment/appointment_actions.dart';
import 'package:hospital_patient_app/features/appointment/appointment_detail.dart';
import 'package:hospital_patient_app/features/appointment/change_flow.dart';
import 'package:hospital_patient_app/features/booking/catalog_repository.dart';
import 'package:hospital_patient_app/features/booking/steps/date_step.dart' show MonthCalendar;
import 'package:hospital_patient_app/features/booking/steps/time_step.dart' show availableSlotsProvider;
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/home/home_data.dart' show homeAppointmentsProvider;

import 'flow_harness.dart' show FakeAppointmentActions;
import 'harness.dart';

final _theDate = DateTime(2026, 8, 5);
final _slots = [Slot('s-am', DateTime(2026, 8, 5, 9, 0)), Slot('s-16', DateTime(2026, 8, 5, 16, 0))];
const _doctors = [
  Doctor('doc-1', '김의사', '정형외과', null, '월 수 금 오전'),
  Doctor('doc-2', '이의사', '정형외과', null, '화 목 오후'),
];

class ChangeHarness {
  ChangeHarness(this.fake, this.d) {
    router = GoRouter(initialLocation: '/change', routes: [
      GoRoute(path: '/change', builder: (c, s) => Scaffold(body: ChangeWizard(d))),
      GoRoute(path: '/appointments/:id', builder: (c, s) => Scaffold(body: Text('detail-${s.pathParameters['id']}'))),
    ]);
    router.routerDelegate.addListener(() =>
        lastRoute = router.routerDelegate.currentConfiguration.last.matchedLocation);
  }
  final FakeAppointmentActions fake;
  final AppointmentDetail d;
  late final GoRouter router;
  String lastRoute = '/change';
  ProviderContainer? _container;

  ChangeArgs get args => (appointmentId: d.view.id, doctorId: d.doctorId ?? '', doctorName: d.view.doctorName);

  Widget widget() => ProviderScope(
        overrides: [
          appointmentActionsProvider.overrideWithValue(fake),
          availableDatesProvider(d.doctorId!).overrideWith((ref) async => [_theDate]),
          availableSlotsProvider((doctorId: d.doctorId!, date: _theDate)).overrideWith((ref) async => _slots),
          doctorsProvider(d.departmentId!).overrideWith((ref) async => _doctors),
          homeAppointmentsProvider.overrideWith((ref) async => <AppointmentView>[]),
        ],
        child: MaterialApp.router(theme: AppTheme.theme, routerConfig: router),
      );

  ProviderContainer container(WidgetTester t) =>
      _container ??= ProviderScope.containerOf(t.element(find.byType(ChangeWizard)));
}

Future<ChangeHarness> _pumpChange(WidgetTester t,
    {AppointmentDetail? d, FakeAppointmentActions? fake, int atStep = 0}) async {
  await t.binding.setSurfaceSize(const Size(390, 1600));
  addTearDown(() => t.binding.setSurfaceSize(null));
  final h = ChangeHarness(fake ?? FakeAppointmentActions(), d ?? detail(slot: DateTime(2026, 8, 5, 14, 30)));
  await t.pumpWidget(h.widget());
  await t.pumpAndSettle();
  if (atStep == 1) {
    h.container(t).read(changeControllerProvider(h.args).notifier).selectDate(_theDate);
    await t.pumpAndSettle();
  }
  return h;
}

void main() {
  testWidgets('[APPT-CHG-02][APPT-CHG-03] 같은 과·의사 고정 표시, 진료과는 안 고른다', (t) async {
    await _pumpChange(t, d: detail(dept: '내과', doctor: '김의사'));
    expect(find.textContaining('내과'), findsWidgets);
    expect(find.textContaining('김의사'), findsWidgets);
    expect(find.text('진료과 선택'), findsNothing);
  });

  testWidgets('[APPT-CHG-04] 날짜 화면에 다른 의사도 보기(같은 과)', (t) async {
    await _pumpChange(t);
    expect(find.text('다른 의사도 보기'), findsOneWidget);
  });

  testWidgets('[APPT-CHG-07] 진행 표시는 1단계/2단계(8단계 막대 아님)', (t) async {
    await _pumpChange(t);
    expect(find.textContaining('1단계 / 2단계'), findsOneWidget);
    expect(find.textContaining('8단계'), findsNothing);
  });

  testWidgets('[APPT-CHG-08][APPT-CHG-09] 시간을 고르면 전→후 확인 팝업(생략 안 함)', (t) async {
    await _pumpChange(t, d: detail(slot: DateTime(2026, 8, 5, 14, 30)), atStep: 1);
    await t.tap(find.text('16:00')); // 16:00 슬롯(그룹이 오후를 말함)
    await t.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(find.text('변경 전 · 8월 5일 오후 2:30'), findsOneWidget); // 전
    expect(find.text('변경 후 · 8월 5일 오후 4:00'), findsOneWidget); // 후
  });

  testWidgets('[APPT-CHG-11] [아니요]면 변경하지 않고 시간 선택 그대로', (t) async {
    final h = await _pumpChange(t, atStep: 1);
    await t.tap(find.text('16:00'));
    await t.pumpAndSettle();
    await t.tap(find.text('아니요'));
    await t.pumpAndSettle();
    expect(h.fake.lastChangeSlotId, isNull); // change 호출 없음
    expect(find.text('변경할 시간을 골라주세요'), findsOneWidget); // 시간 화면 그대로
  });

  testWidgets('[APPT-CHG-15] 변경 성공 → 새 예약 상세로', (t) async {
    final h = await _pumpChange(t, atStep: 1, fake: FakeAppointmentActions(changeResult: 'new-appt-id'));
    await t.tap(find.text('16:00'));
    await t.pumpAndSettle();
    await t.tap(find.text('변경합니다'));
    await t.pumpAndSettle();
    expect(h.fake.lastChangeSlotId, 's-16');
    expect(h.lastRoute, '/appointments/new-appt-id');
  });

  testWidgets('[APPT-CHG-17] [변경합니다] 처리 중 잠금(변경하는 중…)', (t) async {
    await _pumpChange(t, atStep: 1, fake: FakeAppointmentActions(slowChange: true));
    await t.tap(find.text('16:00'));
    await t.pumpAndSettle();
    await t.tap(find.text('변경합니다'));
    await t.pump(); // 다이얼로그 닫힘
    await t.pump(); // 제출 시작(오버레이)
    expect(find.text('변경하는 중…'), findsOneWidget); // 처리 중 잠금(중복 클릭 막힘)
    // 타이머를 소화한다(네비게이션 자체는 APPT-CHG-15가 검증). 라우트 전환 애니메이션까지 pump.
    await t.pump(const Duration(seconds: 1));
    await t.pump(const Duration(milliseconds: 400));
  });

  testWidgets('[APPT-CHG-18] 그 시간이 이미 차면 시간 화면 격자 위 안내', (t) async {
    final h = await _pumpChange(t,
        atStep: 1,
        fake: FakeAppointmentActions(changeError: ApiException('16:00은 방금 다른 분이 예약하셨습니다', statusCode: 409)));
    await t.tap(find.text('16:00'));
    await t.pumpAndSettle();
    await t.tap(find.text('변경합니다'));
    await t.pumpAndSettle();
    expect(h.container(t).read(changeControllerProvider(h.args)).step, 1); // 시간 화면
    expect(find.textContaining('방금 다른 분이'), findsOneWidget);
  });

  // ── 변경 완료 후 상세(APPT-CHG-12·13·16) ─────────────────────────────────
  testWidgets('[APPT-CHG-12][APPT-CHG-13] 변경 성공 후 상세에 예약번호 새 발급 안내(팝업 아님)', (t) async {
    await pumpDetail(t, detail: detail(status: '예약확정'), changed: true);
    expect(find.text('예약번호가 새로 발급되었습니다'), findsOneWidget);
    expect(find.byType(AlertDialog), findsNothing);
  });

  testWidgets('[APPT-CHG-16] 직원확인후확정 병원은 변경 후 다시 예약신청(QR 점선)', (t) async {
    await pumpDetail(t, detail: detail(status: '예약신청'), changed: true);
    expect(find.text('확정되면 여기에 접수용 QR이 나타납니다'), findsOneWidget);
  });

  // ── 마감 후 변경(Step 6, APPT-CHG-19·20) — 취소와 공통 안내 팝업 ─────────
  AppointmentDetail lateDetail() => detail(
        status: '예약확정',
        slot: DateTime.now().add(const Duration(hours: 1)), // 진료 1시간 뒤 = 마감(24h 전) 지남
        createdAt: DateTime.now().subtract(const Duration(hours: 2)), // 30분 유예 밖
        deadlineHours: 24,
      );

  Future<FakeAppointmentActions> pumpChangeLate(WidgetTester t) async {
    await t.binding.setSurfaceSize(const Size(390, 1400));
    addTearDown(() => t.binding.setSurfaceSize(null));
    final fake = FakeAppointmentActions();
    final d = lateDetail();
    final router = GoRouter(initialLocation: '/appointments/a1', routes: [
      GoRoute(path: '/appointments/:id', builder: (c, s) => const Scaffold(body: Text('stub-detail'))),
      GoRoute(path: '/appointments/:id/change', builder: (c, s) => ChangeScreen(s.pathParameters['id']!)),
      GoRoute(path: '/chat', builder: (c, s) => const Scaffold(body: Text('stub-chat'))),
    ]);
    await t.pumpWidget(ProviderScope(
      overrides: [
        appointmentActionsProvider.overrideWithValue(fake),
        appointmentDetailProvider('a1').overrideWith((ref) async => d),
      ],
      child: MaterialApp.router(theme: AppTheme.theme, routerConfig: router),
    ));
    await t.pumpAndSettle();
    router.push('/appointments/a1/change');
    await t.pumpAndSettle();
    return fake;
  }

  testWidgets('[APPT-CHG-19] 마감 후 변경은 취소와 같은 안내 팝업 + 상담 연결(변경)', (t) async {
    final fake = await pumpChangeLate(t);
    expect(find.text('변경 마감 시간이 지났습니다'), findsOneWidget);
    await t.tap(find.text('상담 채팅 연결'));
    await t.pump();
    await t.pump();
    expect(fake.supportRequests, ['변경']); // request_type='변경'
  });

  testWidgets('[APPT-CHG-20] 마감 후 변경에서 새 시간을 미리 고르거나 저장하지 않는다', (t) async {
    await pumpChangeLate(t);
    expect(find.byType(MonthCalendar), findsNothing); // 희망 시간 폼 없음(상담에서 정함)
    expect(find.text('변경할 날짜를 골라주세요'), findsNothing);
  });
}
