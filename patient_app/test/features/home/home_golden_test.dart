import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/pending_request.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/home/home_data.dart';
import 'package:hospital_patient_app/features/home/home_screen.dart';

// 골든 게이트(핸드오프 정본 방식) — 데모(demo-home.png)와 시각 대조하기 위해 실제 렌더를 PNG로 남긴다.
// 한글 글자가 tofu로 나오지 않게 시스템 한글 폰트를 기본 패밀리로 로드한다.

AppointmentView _v(String id, String status, String name, String time, String dept, String doctor,
        {String? code, String relation = '본인', bool isSelf = true}) =>
    AppointmentView.fromJson({
      'id': id,
      'status': status,
      'for_patient_name': name,
      'relation': relation,
      'is_self': isSelf,
      'booking_code': code,
      'department_name': dept,
      'doctor_name': doctor,
      'has_questionnaire': false,
      'slot_date': '2030-08-18',
      'start_time': time,
      'hospital_change_prev_time': null,
      'hospital_change_kind': null,
    });

Widget _home(List<AppointmentView> appts) => ProviderScope(
      overrides: [
        homeAppointmentsProvider.overrideWith((ref) async => appts),
        hospitalInfoProvider.overrideWith((ref) async => null),
        pendingRequestProvider.overrideWith((ref) async => null),
        // 대기 카드의 「내 앞 N명」을 골든에 담는다(실 배선 대신 고정값).
        queueStatusProvider.overrideWith(
            (ref, id) async => const QueueStatus(patientsAhead: 3, estimatedWaitMinutes: 25)),
      ],
      child: const MaterialApp(home: HomeScreen()),
    );

void main() {
  setUpAll(() async {
    for (final path in [
      '/System/Library/Fonts/Supplemental/AppleGothic.ttf',
    ]) {
      final f = File(path);
      if (f.existsSync()) {
        final loader = FontLoader('Roboto')
          ..addFont(Future.value(f.readAsBytesSync().buffer.asByteData()));
        await loader.load();
      }
    }
  });

  testWidgets('home golden (데모 대조용)', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 780));
    addTearDown(() => t.binding.setSurfaceSize(null));
    await t.pumpWidget(_home([
      _v('1', '진료대기', '김순자', '09:30', '내과', '이정훈', code: 'K7P2Q9'),
      _v('2', '예약확정', '박말순', '14:00', '안과', '오세림',
          code: 'M4T8XR', relation: '어머니', isSelf: false),
    ]));
    await t.pumpAndSettle();
    await expectLater(find.byType(HomeScreen), matchesGoldenFile('goldens/home.png'));
  });
}
