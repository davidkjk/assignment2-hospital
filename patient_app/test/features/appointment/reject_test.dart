import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/appointment/appointment_actions.dart';
import 'package:hospital_patient_app/features/appointment/appointment_detail.dart';
import 'package:hospital_patient_app/features/appointment/reject_banner.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/home/home_data.dart' show homeAppointmentsProvider;
import 'package:hospital_patient_app/features/notifications/notification_view.dart';

import 'flow_harness.dart';
import 'harness.dart';

class _RejectHarness {
  _RejectHarness(this.fake) {
    router = GoRouter(initialLocation: '/', routes: [
      GoRoute(path: '/', builder: (c, s) => _body!),
      GoRoute(path: '/appointments/:id', builder: (c, s) => const Scaffold(body: Text('stub-detail'))),
      GoRoute(path: '/chat', builder: (c, s) => const Scaffold(body: Text('stub-chat'))),
    ]);
    router.routerDelegate.addListener(() =>
        lastRoute = router.routerDelegate.currentConfiguration.last.matchedLocation);
  }
  final FakeAppointmentActions fake;
  late final GoRouter router;
  Widget? _body;
  int detailBuilds = 0;
  String lastRoute = '/';
  bool get invalidatedDetail => detailBuilds > 1;

  Widget wrap(AppointmentDetail d, Widget child) {
    _body = child;
    return ProviderScope(
      overrides: [
        appointmentActionsProvider.overrideWithValue(fake),
        appointmentDetailProvider('a1').overrideWith((ref) async {
          detailBuilds++;
          return d;
        }),
        homeAppointmentsProvider.overrideWith((ref) async => <AppointmentView>[]),
      ],
      child: MaterialApp.router(theme: AppTheme.theme, routerConfig: router),
    );
  }
}

Future<_RejectHarness> _pumpReject(WidgetTester t, {required AppointmentDetail d}) async {
  await t.binding.setSurfaceSize(const Size(390, 1200));
  addTearDown(() => t.binding.setSurfaceSize(null));
  final h = _RejectHarness(FakeAppointmentActions());
  // 배너가 상세 provider를 watch해 invalidate가 관찰되도록 Consumer로 감싼다.
  await t.pumpWidget(h.wrap(
      d,
      Consumer(builder: (c, ref, _) {
        ref.watch(appointmentDetailProvider('a1'));
        return Scaffold(body: SingleChildScrollView(child: CancelRejectBanner(d)));
      })));
  await t.pump();
  await t.pump();
  return h;
}

void main() {
  testWidgets('[CANCEL-REJ-01][CANCEL-REJ-02] 카드 위 배너에 반려 문구 + 직원 사유 그대로', (t) async {
    await _pumpReject(t,
        d: detail(cancelRejectedAt: DateTime.now(), cancelRejectedReason: '진료 준비가 이미 진행되었습니다'));
    expect(find.text('취소가 어렵다는 답변을 받았습니다'), findsOneWidget);
    expect(find.text('진료 준비가 이미 진행되었습니다'), findsOneWidget);
  });

  testWidgets('[CANCEL-REJ-04][CANCEL-REJ-05] [확인]을 누르면 서버에 알리고 상세를 다시 그린다(정상 복귀)', (t) async {
    final h = await _pumpReject(t, d: detail(cancelRejectedAt: DateTime.now(), cancelRejectedReason: '사유'));
    await t.tap(find.text('확인'));
    await t.pumpAndSettle();
    expect(h.fake.ackRejections, ['a1']); // acknowledge_cancel_rejection
    expect(h.invalidatedDetail, isTrue); // QR 정상 복귀(재조회)
  });

  testWidgets('[CANCEL-REJ-06] 다시 문의하기는 횟수 제한 없이 상담을 다시 연다', (t) async {
    final h = await _pumpReject(t, d: detail(cancelRejectedAt: DateTime.now(), cancelRejectedReason: '사유'));
    await t.tap(find.text('다시 문의하기 ›'));
    await t.pumpAndSettle();
    expect(h.lastRoute, contains('/chat'));
  });

  testWidgets('[CANCEL-REJ-03] 사유가 비어도 배너는 뜬다(직원웹이 필수로 받지만 방어)', (t) async {
    await _pumpReject(t, d: detail(cancelRejectedAt: DateTime.now(), cancelRejectedReason: null));
    expect(find.text('취소가 어렵다는 답변을 받았습니다'), findsOneWidget); // 크래시 없음
  });

  testWidgets('[CANCEL-REJ-03b] 반려가 없으면 배너는 자리를 차지하지 않는다', (t) async {
    await _pumpReject(t, d: detail(cancelRejectedAt: null));
    expect(find.text('취소가 어렵다는 답변을 받았습니다'), findsNothing);
  });

  test('[CANCEL-REJ-07] 반려 알림을 누르면 그 예약 상세로 보낸다(T18 라우팅 소비)', () {
    // notification_log의 cancellation_rejected → resolveNotificationRoute(T18)가 /appointments/:id
    final route = resolveNotificationRoute(NotificationView(
      id: 'n1',
      notificationType: 'cancellation_rejected',
      kind: 'transactional',
      body: '취소가 어렵습니다',
      appointmentId: 'a1',
      sentAt: DateTime(2026, 8, 5),
      isRead: false,
    ));
    expect(route, '/appointments/a1');
  });
}
