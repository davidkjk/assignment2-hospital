import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hospital_patient_app/core/connectivity.dart';
import 'package:hospital_patient_app/core/offline_cache.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/home/home_data.dart';
import 'package:hospital_patient_app/features/appointments/my_appointments_data.dart';
import 'package:hospital_patient_app/features/appointments/appointment_list_row.dart';
import 'package:hospital_patient_app/features/appointments/my_appointments_screen.dart';
import 'package:hospital_patient_app/widgets/empty_state.dart';
import 'package:hospital_patient_app/widgets/offline_banner.dart';
import 'package:hospital_patient_app/widgets/app_shell.dart';

AppointmentView _view(String status, {String id = 'a'}) => AppointmentView.fromJson({
      'id': id,
      'status': status,
      'for_patient_name': '본인',
      'is_self': true,
      'department_name': '내과',
      'doctor_name': '이의사',
      'booking_code': 'A',
      'has_questionnaire': false,
      'slot_date': '2026-09-01',
      'start_time': '10:00',
    });

class _SpyRealtime implements UpcomingRealtime {
  final _ctl = StreamController<void>.broadcast();
  bool active = false;
  @override
  Stream<void> get events => _ctl.stream;
  @override
  void setActive(bool a) => active = a;
  void fire() => _ctl.add(null);
}

/// homeAppointmentsProvider·connectivity·cache·realtime을 override해 상태를 만든다.
Widget _screen({
  List<AppointmentView>? data,
  bool online = true,
  bool stale = false,
  Object? error,
  _SpyRealtime? realtime,
  void Function()? onFetch,
}) {
  final overrides = <Override>[
    connectivityProvider.overrideWith((ref) => Stream.value(online)),
    homeAppointmentsProvider.overrideWith((ref) async {
      onFetch?.call();
      if (error != null) throw error;
      return data;
    }),
    if (realtime != null) upcomingRealtimeProvider.overrideWithValue(realtime),
    if (stale)
      upcomingCacheProvider.overrideWith((ref) async =>
          CachedUpcoming(items: const [], savedAt: DateTime.now().subtract(const Duration(hours: 25)))),
  ];
  // 오프라인 띠는 전역 셸(AppShell)이 얹으므로 화면을 셸로 감싸 실제 배치대로 검증한다(NAV-GLOBAL-01).
  return ProviderScope(
      overrides: overrides,
      child: const MaterialApp(
          home: AppShell(body: MyAppointmentsScreen(), bottomTabs: SizedBox.shrink())));
}

void main() {
  // ─── Step 3: 빈 상태·오프라인·조회 실패 세 분기 ───

  testWidgets('[LIST-EMPTY-01][LIST-EMPTY-02][LIST-EMPTY-03][LIST-CTA-03] 온라인 0건 → 안내 + 하단 CTA, [다시 시도]·최근 방문 없음',
      (t) async {
    await t.pumpWidget(_screen(data: [], online: true));
    await t.pumpAndSettle();
    expect(find.text('예약된 진료가 없습니다'), findsOneWidget);
    expect(find.textContaining('가까운 날짜로'), findsOneWidget);
    expect(find.text('+ 새 예약하기'), findsOneWidget); // 0건에도 CTA(LIST-CTA-03)
    expect(find.textContaining('다시 시도'), findsNothing); // LIST-EMPTY-02: 실패가 아니라 사실
    expect(find.textContaining('최근 방문'), findsNothing); // LIST-EMPTY-03
  });

  testWidgets('[LIST-EMPTY-04][LIST-EMPTY-05] 오프라인 + 보관본 있음 → 보관본 그대로 + 오프라인 띠', (t) async {
    await t.pumpWidget(_screen(data: [_view('예약확정')], online: false));
    await t.pumpAndSettle();
    expect(find.byType(AppointmentBox), findsOneWidget); // 목록을 그대로 보여준다
    expect(find.byType(OfflineBanner), findsOneWidget); // 맨 위 오프라인 띠(OFF-BAN)
  });

  testWidgets('[LIST-EMPTY-06] 보관본 24시간 초과 → 화면 위쪽에 경고 한 번(줄마다 아님)', (t) async {
    await t.pumpWidget(_screen(data: [_view('예약확정')], online: false, stale: true));
    await t.pumpAndSettle();
    expect(find.textContaining('시간이 지난'), findsOneWidget); // OFF-STALE-01, 한 번만
  });

  testWidgets('[LIST-EMPTY-07] 오프라인 + 보관본 없음 → EmptyState.offline + [다시 시도]', (t) async {
    await t.pumpWidget(_screen(data: null, online: false));
    await t.pumpAndSettle();
    expect(find.byType(EmptyState), findsOneWidget);
    expect(find.textContaining('다시 시도'), findsWidgets); // EMPTY-OFF-01
  });

  testWidgets('[LIST-EMPTY-08][LIST-EMPTY-10] 조회 실패 → EmptyState.error, 예외 원문 안 뜸', (t) async {
    await t.pumpWidget(_screen(error: Exception('psycopg: relation ...'), online: true));
    await t.pumpAndSettle();
    expect(find.byType(EmptyState), findsOneWidget);
    expect(find.textContaining('psycopg'), findsNothing); // LIST-EMPTY-10: Text('$e') 금지
  });

  testWidgets('[LIST-EMPTY-09] 오프라인·실패엔 0건 화면(예약된 진료가 없습니다)을 띄우지 않는다', (t) async {
    await t.pumpWidget(_screen(data: null, online: false));
    await t.pumpAndSettle();
    expect(find.text('예약된 진료가 없습니다'), findsNothing); // 0건이 아니라 「모르는 것」
  });

  // ─── Step 4: 갱신·실시간 구독·스크롤 보존 ───

  testWidgets('[LIST-REFRESH-01] 화면에 들어올 때 1회, 아래로 당기면 다시 조회한다', (t) async {
    var fetches = 0;
    await t.pumpWidget(_screen(data: [_view('예약확정')], online: true, onFetch: () => fetches++));
    await t.pumpAndSettle();
    expect(fetches, 1); // 진입 시 1회(추가 invalidate 없음)
    await t.fling(find.byType(RefreshIndicator), const Offset(0, 300), 1000);
    await t.pumpAndSettle();
    expect(fetches, 2); // 당겨서 새로고침 시 재조회(HOME-REFRESH-01)
  });

  testWidgets('[LIST-REFRESH-02] 보는 동안 활성 예약이 있으면 실시간 구독한다', (t) async {
    final sub = _SpyRealtime();
    await t.pumpWidget(_screen(data: [_view('진료대기')], online: true, realtime: sub));
    await t.pumpAndSettle();
    expect(sub.active, isTrue); // 대기실에서 아무것도 안 눌러도 저절로 바뀐다
  });

  testWidgets('[LIST-REFRESH-02] 바뀔 것이 없으면(진료완료뿐) 구독을 붙잡지 않는다', (t) async {
    final sub = _SpyRealtime();
    await t.pumpWidget(_screen(data: [_view('진료완료')], online: true, realtime: sub)); // filterUpcoming 0건
    await t.pumpAndSettle();
    expect(sub.active, isFalse);
  });

  testWidgets('[LIST-REFRESH-03] 실시간 이벤트가 오면 재조회해 「확인 중」이 저절로 사라진다', (t) async {
    final sub = _SpyRealtime();
    var current = [_view('예약신청')];
    final scope = ProviderScope(
      overrides: [
        connectivityProvider.overrideWith((ref) => Stream.value(true)),
        upcomingRealtimeProvider.overrideWithValue(sub),
        homeAppointmentsProvider.overrideWith((ref) async => current),
      ],
      child: const MaterialApp(home: MyAppointmentsScreen()),
    );
    await t.pumpWidget(scope);
    await t.pumpAndSettle();
    expect(find.text('확인 중'), findsOneWidget);
    current = [_view('예약확정')]; // 병원이 승인
    sub.fire(); // 실시간 이벤트 = invalidate → 재조회
    await t.pumpAndSettle();
    expect(find.text('확인 중'), findsNothing); // 저절로 사라짐(A등급)
  });

  test('[LIST-REFRESH-04] 갱신 결과가 내가 보던 것과 다르면 OFF-BACK-02를 따른다', () {
    expect(offBackApplies(before: ['A'], after: []), isTrue); // 보던 A가 빠짐
    expect(offBackApplies(before: ['A'], after: ['A']), isFalse); // 그대로면 아님
  });

  testWidgets('[LIST-REFRESH-05] 목록 ListView에 PageStorageKey가 있어 상세에서 돌아오면 스크롤이 보존된다', (t) async {
    final data = List.generate(20, (i) => _view('예약확정', id: '$i'));
    await t.pumpWidget(_screen(data: data, online: true));
    await t.pumpAndSettle();
    final list = t.widget<ListView>(find.byType(ListView));
    expect(list.key, const PageStorageKey('my-appointments')); // NAV-LIST-08·NAV-APPT-02
  });
}
