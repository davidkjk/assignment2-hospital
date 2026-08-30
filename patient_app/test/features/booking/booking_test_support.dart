import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/booking/booking_controller.dart';
import 'package:hospital_patient_app/features/booking/booking_targets_provider.dart';
import 'package:hospital_patient_app/features/booking/catalog_repository.dart';

// 픽스처
const kSelf = BookingTarget('me', '김순자', null);
const kMom = BookingTarget('mom', '박영자', '어머니');
const kInternal = Department('d1', '내과');
const kDocPhoto = Doctor('doc1', '김의사', '소화기내과', 'https://cdn/a.jpg', '월·수·금 오전');
const kDocNoPhoto = Doctor('doc2', '이의사', null, null, '진료시간 문의');

/// 이동 목적지 확인용 마커 화면.
class RouteMarker extends StatelessWidget {
  const RouteMarker(this.name, {super.key});
  final String name;
  @override
  Widget build(BuildContext context) => Scaffold(body: Center(child: Text('MARK:$name')));
}

bool wentTo(String name) => find.text('MARK:$name').evaluate().isNotEmpty;

/// 스텝/셸을 provider override와 함께 pump하고, bookingProvider를 읽을 container를 돌려준다.
/// 앞 선택(target·dept·doctor)을 미리 세팅해 원하는 단계 상태를 만든다.
Future<ProviderContainer> pumpBooking(
  WidgetTester t,
  Widget screen, {
  List<Override> overrides = const [],
  BookingTarget? target,
  Department? department,
  Doctor? doctor,
  DateTime? date,
  void Function(BookingController)? advance,
}) async {
  final container = ProviderContainer(overrides: overrides);
  addTearDown(container.dispose);
  final ctl = container.read(bookingProvider.notifier);
  if (target != null) ctl.selectTarget(target);
  if (department != null) ctl.selectDepartment(department);
  if (doctor != null) ctl.selectDoctor(doctor);
  if (date != null) ctl.selectDate(date);
  advance?.call(ctl); // 슬롯·이유 등 추가 진행
  // 스텝은 실제 앱에서 마법사 Scaffold 안에 산다 — 격리 테스트에서도 Material 조상을 준다.
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (c, s) => Scaffold(body: SafeArea(child: screen))),
    GoRoute(path: '/family', builder: (c, s) => const RouteMarker('family')),
    GoRoute(path: '/home', builder: (c, s) => const RouteMarker('home')),
    GoRoute(
        path: '/my/appointments/:id/questionnaire',
        builder: (c, s) => RouteMarker('qnr:${s.pathParameters['id']}')),
  ]);
  await t.pumpWidget(UncontrolledProviderScope(
    container: container,
    child: MaterialApp.router(routerConfig: router, theme: AppTheme.theme),
  ));
  return container;
}

/// 대상 목록을 고정 주입하는 override(WhoStep용).
Override targetsOverride(List<BookingTarget> targets) =>
    bookingTargetsProvider.overrideWith((ref) async => targets);
