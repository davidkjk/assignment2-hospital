import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/core/connectivity.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/appointment/appointment_detail.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';

/// 상세 화면 한 벌을 만든다. 서버 판정(상태·문진상태·방문이유 등)은 fixture가 정해 주입한다 —
/// 앱은 판정하지 않고 받은 값을 그린다.
AppointmentDetail detail({
  String status = '예약확정',
  DateTime? slot,
  String relation = '본인',
  String forName = '김순자',
  bool isSelf = true,
  String dept = '정형외과',
  String doctor = '김의사',
  String? reason = '무릎 통증',
  String? address = '서울 강남구 1',
  String? phone = '02-123-4567',
  String qnr = 'none',
  String? code = 'A-1234',
  DateTime? supportRequestedAt,
}) =>
    AppointmentDetail(
      view: AppointmentView(
        id: 'a1',
        status: status,
        forPatientName: forName,
        departmentName: dept,
        doctorName: doctor,
        relation: relation,
        bookingCode: code,
        // 기본 slot은 미래(오늘 기준)여야 '예약확정'이 late가 아니라 confirmed로 잡힌다.
        slotStart: slot ?? DateTime.now().add(const Duration(days: 7)),
        hasQuestionnaire: qnr != 'none',
        isSelf: isSelf,
      ),
      reason: reason,
      hospitalAddress: address,
      hospitalPhone: phone,
      questionnaireStatus: qnr,
      supportRequestedAt: supportRequestedAt,
    );

/// 상세 화면 + 도착지 스텁 라우트를 묶은 하네스. 명령형 push 뒤 화면 위치를 lastRoute로 관찰한다.
class DetailHarness {
  DetailHarness({this.fixture, this.online = true, this.action = const AsyncData(null)}) {
    router = GoRouter(initialLocation: '/appointments/a1', routes: [
      GoRoute(
          path: '/appointments/:id',
          builder: (c, s) => AppointmentDetailScreen(s.pathParameters['id']!)),
      GoRoute(path: '/appointments/:id/change', builder: (c, s) => _stub('change')),
      GoRoute(path: '/appointments/:id/cancel', builder: (c, s) => _stub('cancel')),
      GoRoute(path: '/qr/:id', builder: (c, s) => _stub('qr')),
      GoRoute(path: '/questionnaire/:id', builder: (c, s) => _stub('questionnaire')),
      GoRoute(path: '/booking', builder: (c, s) => _stub('booking')),
      GoRoute(path: '/chat', builder: (c, s) => _stub('chat')),
      GoRoute(path: '/my', builder: (c, s) => _stub('my')),
    ]);
    router.routerDelegate.addListener(() {
      lastRoute = router.routerDelegate.currentConfiguration.last.matchedLocation;
    });
  }

  final AppointmentDetail? fixture;
  final bool online;
  final AsyncValue<void> action;
  late final GoRouter router;
  String lastRoute = '/appointments/a1';

  static Widget _stub(String name) => Scaffold(body: Text('stub-$name'));

  Widget widget() => ProviderScope(
        overrides: [
          appointmentDetailProvider('a1').overrideWith((ref) async => fixture),
          connectivityProvider.overrideWith((ref) => Stream.value(online)),
          detailActionProvider('a1').overrideWith((ref) => action),
        ],
        child: MaterialApp.router(theme: AppTheme.theme, routerConfig: router),
      );
}

/// /appointments/a1 상세 화면을 띄운다. detail을 주지 않으면 「없는 예약」(NAV-APPT-23)이 그려진다.
Future<DetailHarness> pumpDetail(
  WidgetTester t, {
  AppointmentDetail? detail,
  bool online = true,
  AsyncValue<void> action = const AsyncData(null),
}) async {
  await t.binding.setSurfaceSize(const Size(390, 1600));
  addTearDown(() => t.binding.setSurfaceSize(null));
  final h = DetailHarness(fixture: detail, online: online, action: action);
  await t.pumpWidget(h.widget());
  // ⚠️ pumpAndSettle 금지 — 로딩 프레임의 CircularProgressIndicator는 무한 애니메이션이라 settle되지
  //    않는다(각 테스트가 10분 타임아웃). FutureProvider 오버라이드는 microtask로 완료되므로 pump 두 번:
  //    ① future(microtask) 완료 ② data 분기로 재빌드.
  await t.pump();
  await t.pump();
  return h;
}
