import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import '../../support/golden_fonts.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/home/home_data.dart';
import 'package:hospital_patient_app/features/appointments/my_appointments_screen.dart';

// 데모(demo/src/routes/patient/appointments/*, 목업 46-appointments-tab.html)와 눈대조하는 골든.
// 얇은 줄·시각 레일·상태 글자·날짜 헤더·건수 — 홈의 큰 카드와 다른 '훑는 목록'.

AppointmentView _v(String status, String date, String time,
        {String id = 'a', String name = '본인', bool self = true, DateTime? change}) =>
    AppointmentView.fromJson({
      'id': '$id-$time',
      'status': status,
      'for_patient_name': name,
      'is_self': self,
      'department_name': '내과',
      'doctor_name': '이지은',
      'booking_code': 'A',
      'has_questionnaire': false,
      'slot_date': date,
      'start_time': time,
      'support_requested_at': null,
      'request_type': null,
      'hospital_change_prev_time': change?.toIso8601String(),
      'hospital_change_kind': change == null ? null : 'time',
    });

void main() {
  setUpAll(() async {
    await loadGoldenFonts();
  });

  testWidgets('golden: 나의 예약 목록 — 날짜 헤더·얇은 줄·상태 글자', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => t.binding.setSurfaceSize(null));
    final data = [
      _v('예약신청', '2050-09-01', '09:00', id: 'a1'), // 확인 중(회색 레일)
      _v('예약확정', '2050-09-01', '10:30', id: 'a2', name: '어머니', self: false), // 가족
      _v('예약확정', '2050-09-03', '14:00', id: 'a3', change: DateTime(2050, 8, 20, 9)), // 시간 변경됨
    ];
    final router = GoRouter(routes: [
      GoRoute(path: '/', builder: (c, s) => const MyAppointmentsScreen()),
    ]);
    await t.pumpWidget(ProviderScope(
      overrides: [homeAppointmentsProvider.overrideWith((ref) async => data)],
      child: MaterialApp.router(theme: AppTheme.theme, routerConfig: router),
    ));
    await t.pumpAndSettle();
    await expectLater(
        find.byType(MyAppointmentsScreen), matchesGoldenFile('goldens/my-appointments-list.png'));
  });
}
