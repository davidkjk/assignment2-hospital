import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/appointment/appointment_actions.dart';
import 'package:hospital_patient_app/features/appointment/appointment_detail.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/home/home_data.dart' show homeAppointmentsProvider;

/// 서버 없이 취소·변경·상담·확인을 주입하는 가짜 액션(공개 메서드만 구현하면 된다 — private _api는 요구 안 됨).
class FakeAppointmentActions implements AppointmentActions {
  FakeAppointmentActions({
    this.cancelResult,
    this.cancelError,
    this.changeResult = 'new-appt-id',
    this.changeError,
    this.slowChange = false,
  });

  CancelResult? cancelResult;
  ApiException? cancelError;
  String changeResult;
  ApiException? changeError;
  bool slowChange;

  final List<String> supportRequests = []; // request_type들
  final List<String> ackRejections = [];
  final List<String> ackChanges = [];
  String? lastChangeSlotId;

  @override
  Future<CancelResult> cancel(String id, DateTime expectedUpdatedAt) async {
    if (cancelError != null) throw cancelError!;
    return cancelResult ?? (cancelled: true, afterDeadline: false);
  }

  @override
  Future<String> change(String id, String newSlotId, String reason, DateTime expectedUpdatedAt) async {
    lastChangeSlotId = newSlotId;
    if (slowChange) await Future<void>.delayed(const Duration(seconds: 1));
    if (changeError != null) throw changeError!;
    return changeResult;
  }

  @override
  Future<void> requestSupport(String id, String requestType) async => supportRequests.add(requestType);

  @override
  Future<void> acknowledgeRejection(String id) async => ackRejections.add(id);

  @override
  Future<void> acknowledgeChange(String id) async => ackChanges.add(id);
}

/// 흐름 하네스 — 상세/홈 provider의 재실행 횟수로 invalidate를 관찰하고, 도착 라우트를 lastRoute로 본다.
class FlowHarness {
  FlowHarness({required this.fixture, required this.fake, required Widget Function(FlowHarness) child}) {
    router = GoRouter(initialLocation: '/', routes: [
      GoRoute(path: '/', builder: (c, s) => child(this)),
      GoRoute(path: '/appointments/:id', builder: (c, s) => _stub('detail-${s.pathParameters['id']}')),
      GoRoute(path: '/chat', builder: (c, s) => _stub('chat')),
      GoRoute(path: '/booking', builder: (c, s) => _stub('booking')),
    ]);
    router.routerDelegate.addListener(() {
      lastRoute = router.routerDelegate.currentConfiguration.last.matchedLocation;
    });
  }

  final AppointmentDetail fixture;
  final FakeAppointmentActions fake;
  late final GoRouter router;
  int detailBuilds = 0;
  int homeBuilds = 0;
  String lastRoute = '/';

  static Widget _stub(String name) => Scaffold(body: Text('stub-$name'));

  bool get invalidatedDetail => detailBuilds > 1;
  bool get invalidatedHome => homeBuilds > 1;

  Widget widget() => ProviderScope(
        overrides: [
          appointmentActionsProvider.overrideWithValue(fake),
          appointmentDetailProvider('a1').overrideWith((ref) async {
            detailBuilds++;
            return fixture;
          }),
          homeAppointmentsProvider.overrideWith((ref) async {
            homeBuilds++;
            return <AppointmentView>[];
          }),
        ],
        child: MaterialApp.router(theme: AppTheme.theme, routerConfig: router),
      );
}

/// 상세/홈을 함께 watch해 invalidate가 재실행을 부르게 만드는 버튼 하나짜리 호스트.
class FlowHost extends ConsumerWidget {
  const FlowHost({super.key, required this.onTap});
  final void Function(BuildContext, WidgetRef) onTap;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(appointmentDetailProvider('a1')); // invalidate 관찰용
    ref.watch(homeAppointmentsProvider); // APPT-RACE-08 관찰용
    return Scaffold(
      body: Center(
        child: ElevatedButton(onPressed: () => onTap(context, ref), child: const Text('go')),
      ),
    );
  }
}

/// 버튼을 눌러 흐름을 시작하는 하네스를 띄운다. onTap이 openCancelFlow 등 흐름 함수를 부른다.
Future<FlowHarness> pumpFlow(
  WidgetTester t, {
  required AppointmentDetail fixture,
  required FakeAppointmentActions fake,
  required Future<void> Function(BuildContext, WidgetRef) onTap,
}) async {
  await t.binding.setSurfaceSize(const Size(390, 1400));
  addTearDown(() => t.binding.setSurfaceSize(null));
  final h = FlowHarness(
    fixture: fixture,
    fake: fake,
    child: (_) => FlowHost(onTap: (c, r) => onTap(c, r)),
  );
  await t.pumpWidget(h.widget());
  await t.pump(); // detail/home future 완료
  await t.pump();
  return h;
}
