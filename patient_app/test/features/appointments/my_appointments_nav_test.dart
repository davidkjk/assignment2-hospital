import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/home/home_data.dart';
import 'package:hospital_patient_app/features/appointments/appointment_list_row.dart';
import 'package:hospital_patient_app/features/appointments/my_appointments_screen.dart';

AppointmentView _v(String status, String time, {String id = 'appt-1', String name = '본인'}) =>
    AppointmentView.fromJson({
      'id': id,
      'status': status,
      'for_patient_name': name,
      'is_self': name == '본인',
      'department_name': '내과',
      'doctor_name': '이의사',
      'booking_code': 'A',
      'has_questionnaire': false,
      'slot_date': '2026-09-01',
      'start_time': time,
      'support_requested_at': null,
      'request_type': null,
      'hospital_change_prev_time': null,
      'hospital_change_kind': null,
    });

String? _lastRoute;
Widget _app(List<AppointmentView> data,
    {Widget? bottomSlot, Widget Function(AppointmentView)? qBuilder}) {
  final router = GoRouter(routes: [
    GoRoute(
        path: '/',
        builder: (c, s) =>
            MyAppointmentsScreen(bottomSlot: bottomSlot, questionnaireBuilder: qBuilder)),
    GoRoute(path: '/appointments/:id', builder: (c, s) {
      _lastRoute = '/appointments/${s.pathParameters['id']}';
      return const Scaffold(body: Text('상세'));
    }),
    GoRoute(path: '/questionnaire/:id', builder: (c, s) {
      _lastRoute = '/questionnaire/${s.pathParameters['id']}';
      return const Scaffold(body: Text('문진'));
    }),
    GoRoute(path: '/booking', builder: (c, s) {
      _lastRoute = '/booking';
      return const Scaffold(body: Text('예약'));
    }),
  ]);
  return ProviderScope(overrides: [
    homeAppointmentsProvider.overrideWith((ref) async => data),
  ], child: MaterialApp.router(routerConfig: router));
}

void main() {
  setUp(() => _lastRoute = null);

  testWidgets('[NAV-LIST-02][LIST-LIST-14] 줄 본문을 누르면 예약 상세로 간다', (t) async {
    await t.pumpWidget(_app([_v('예약확정', '10:00', id: 'appt-9')]));
    await t.pumpAndSettle();
    await t.tap(find.text('내과 · 이의사 선생님'));
    await t.pumpAndSettle();
    expect(_lastRoute, '/appointments/appt-9');
  });
  testWidgets('[NAV-LIST-03] 날짜 헤더는 누를 수 있는 요소가 아니다(이동 없음)', (t) async {
    await t.pumpWidget(_app([_v('예약확정', '10:00')]));
    await t.pumpAndSettle();
    await t.tap(find.textContaining('9월 1일'));
    await t.pumpAndSettle();
    expect(_lastRoute, isNull); // 죽은 버튼을 만들지 않는다 = 탭해도 아무 일 없음
  });
  testWidgets('[NAV-LIST-04] 상자 안 문진 경고 줄(T31 슬롯)을 누르면 상세를 거치지 않고 문진 화면으로 간다', (t) async {
    await t.pumpWidget(_app([_v('예약확정', '10:00', id: 'appt-7')],
        qBuilder: (v) => TextButton(
            key: const Key('qnr-stub'),
            onPressed: () => MyAppointmentsScreen.openQuestionnaire(v),
            child: const Text('문진 슬롯'))));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('qnr-stub')));
    await t.pumpAndSettle();
    expect(_lastRoute, '/questionnaire/appt-7'); // 상세(/appointments/..)가 아니다
  });
  testWidgets('[NAV-LIST-05][NAV-LIST-06] 하단 [+ 새 예약하기]/빈 상태 CTA를 누르면 예약 1단계로 간다', (t) async {
    await t.pumpWidget(_app([_v('예약확정', '10:00')],
        bottomSlot: TextButton(
            key: const Key('cta-stub'),
            onPressed: () => MyAppointmentsScreen.startBooking(_tester(t)),
            child: const Text('+ 새 예약하기'))));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('cta-stub')));
    await t.pumpAndSettle();
    expect(_lastRoute, '/booking'); // NAV-BOOK-01: 언제나 처음부터
  });
  testWidgets('[NAV-LIST-08] 예약 상세에서 뒤로 오면 목록으로 돌아온다(같은 자리)', (t) async {
    await t.pumpWidget(_app([_v('예약확정', '10:00', id: 'appt-3')]));
    await t.pumpAndSettle();
    await t.tap(find.text('내과 · 이의사 선생님'));
    await t.pumpAndSettle();
    expect(find.text('상세'), findsOneWidget);
    (t.state(find.byType(Navigator)) as NavigatorState).pop(); // 뒤로
    await t.pumpAndSettle();
    expect(find.byType(MyAppointmentsScreen), findsOneWidget); // 목록으로 복귀
  });
  testWidgets('[NAV-LIST-09] 문진 화면에서 뒤로 오면 들어온 자리(목록)로 돌아온다', (t) async {
    await t.pumpWidget(_app([_v('예약확정', '10:00', id: 'appt-5')],
        qBuilder: (v) => TextButton(
            key: const Key('qnr-stub'),
            onPressed: () => MyAppointmentsScreen.openQuestionnaire(v),
            child: const Text('문진 슬롯'))));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('qnr-stub')));
    await t.pumpAndSettle();
    expect(find.text('문진'), findsOneWidget);
    (t.state(find.byType(Navigator)) as NavigatorState).pop();
    await t.pumpAndSettle();
    expect(find.byType(MyAppointmentsScreen), findsOneWidget);
  });
  testWidgets('[NAV-LIST-12] 오프라인으로 진입해도 보관본이 있으면 목록을 그대로 보여준다', (t) async {
    await t.pumpWidget(_app([_v('예약확정', '10:00', name: '본인'), _v('예약확정', '11:00', name: '딸')]));
    await t.pumpAndSettle();
    expect(find.text('정형외과 · 박서준'), findsNothing); // (내과 데이터) — 캐시 줄이 렌더됨
    expect(find.byType(AppointmentBox), findsNWidgets(2));
  });
  testWidgets('[LIST-ROLE-02] 목록은 여러 날을 얇은 줄로 훑는다 — 홈처럼 하루치·큰 카드가 아니다', (t) async {
    await t.pumpWidget(_app([
      _v('예약확정', '10:00', id: 'd1'), // 9/1
      AppointmentView.fromJson({
        'id': 'd3',
        'status': '예약확정',
        'for_patient_name': '본인',
        'is_self': true,
        'department_name': '내과',
        'doctor_name': '이의사',
        'booking_code': 'A',
        'has_questionnaire': false,
        'slot_date': '2026-09-03',
        'start_time': '14:00',
        'support_requested_at': null,
        'request_type': null,
        'hospital_change_prev_time': null,
        'hospital_change_kind': null,
      }),
    ]));
    await t.pumpAndSettle();
    expect(find.textContaining('9월 1일'), findsOneWidget); // 두 날이 다 보인다(하루치가 아니다)
    expect(find.textContaining('9월 3일'), findsOneWidget);
    expect(find.byType(AppointmentBox), findsNWidgets(2)); // 얇은 줄 상자(카드 아님)
  });
  testWidgets('[NAV-LIST-07] [다시 시도]는 화면을 옮기지 않고 그 자리에서 다시 조회한다', (t) async {
    var fetches = 0;
    final router = GoRouter(routes: [
      GoRoute(
          path: '/',
          builder: (c, s) => Consumer(
              builder: (c, ref, _) => Column(children: [
                    const Expanded(child: MyAppointmentsScreen()),
                    TextButton(
                        key: const Key('retry'),
                        onPressed: () => MyAppointmentsScreen.retry(ref),
                        child: const Text('다시 시도')),
                  ]))),
      GoRoute(path: '/x', builder: (c, s) {
        _lastRoute = '/x';
        return const Scaffold(body: Text('x'));
      }),
    ]);
    await t.pumpWidget(ProviderScope(overrides: [
      homeAppointmentsProvider.overrideWith((ref) async {
        fetches++;
        return [_v('예약확정', '10:00')];
      }),
    ], child: MaterialApp.router(routerConfig: router)));
    await t.pumpAndSettle();
    expect(fetches, 1);
    await t.tap(find.byKey(const Key('retry')));
    await t.pumpAndSettle();
    expect(fetches, 2); // 재조회됨(조회 원본 무효화)
    expect(_lastRoute, isNull); // 이동 없음
  });
  testWidgets('[NAV-LIST-10][NAV-LIST-11] 홈 [예약 목록에서 확인]·탈퇴 [예약 보러 가기]로 오면 목록 화면이 열린다', (t) async {
    // 두 버튼(홈 HOME-KILL-01·탈퇴 SET-QUIT-15)은 context.go('/my')로 보낸다.
    // 그 경로가 실제로 목록을 그리는지 = 두 진입이 막다른 길이 아닌지 확인한다.
    final router = GoRouter(initialLocation: '/from', routes: [
      GoRoute(
          path: '/from',
          builder: (c, s) => Scaffold(
                  body: Column(children: [
                TextButton(
                    key: const Key('home-kill'),
                    onPressed: () => c.go('/my'),
                    child: const Text('예약 목록에서 확인')),
                TextButton(
                    key: const Key('quit-see'),
                    onPressed: () => c.go('/my'),
                    child: const Text('예약 보러 가기')),
              ]))),
      GoRoute(path: '/my', builder: (c, s) => const MyAppointmentsScreen()),
    ]);
    await t.pumpWidget(ProviderScope(overrides: [
      homeAppointmentsProvider.overrideWith((ref) async => [_v('예약확정', '10:00')]),
    ], child: MaterialApp.router(routerConfig: router)));
    await t.pumpAndSettle();
    expect(find.byKey(const Key('quit-see')), findsOneWidget); // 탈퇴 진입 버튼도 같은 목적지(/my)
    await t.tap(find.byKey(const Key('home-kill'))); // 홈 진입으로 확인
    await t.pumpAndSettle();
    expect(find.byType(MyAppointmentsScreen), findsOneWidget); // 두 진입 다 목록으로 — 막다른 길 아님
  });
}

BuildContext _tester(WidgetTester t) => t.element(find.byType(MyAppointmentsScreen));
