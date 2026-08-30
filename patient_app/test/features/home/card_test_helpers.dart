import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';

/// 카드 위젯 테스트 공용 셸(스크롤 가능한 Scaffold — 오버플로우 방지).
Widget wrap(Widget child) =>
    MaterialApp(home: Scaffold(body: SingleChildScrollView(child: child)));

AppointmentView reqView({String name = '김순자', String? code = 'A-2413'}) =>
    AppointmentView.fromJson({
      'id': 'a1',
      'status': '예약신청',
      'for_patient_name': name,
      'booking_code': code,
      'department_name': '내과',
      'doctor_name': '이의사',
      'has_questionnaire': false,
      'slot_date': '2030-08-18', // 먼 미래 → 유예 전 → req 유지
      'start_time': '14:00',
      'hospital_change_prev_time': null,
      'hospital_change_kind': null,
    });

AppointmentView waitView({String? code = 'A-2413'}) => AppointmentView.fromJson({
      'id': 'a1',
      'status': '진료대기',
      'for_patient_name': '김순자',
      'booking_code': code,
      'department_name': '내과',
      'doctor_name': '이의사',
      'has_questionnaire': false,
      'slot_date': '2030-08-18',
      'start_time': '14:00',
      'hospital_change_prev_time': null,
      'hospital_change_kind': null,
    });

AppointmentView unconfView({String? code = 'A-2413', bool hasQuestionnaire = false}) =>
    AppointmentView.fromJson({
      'id': 'a1',
      'status': '예약신청',
      'for_patient_name': '김순자',
      'booking_code': code,
      'department_name': '내과',
      'doctor_name': '이의사',
      'has_questionnaire': hasQuestionnaire,
      'slot_date': '2020-08-18', // 먼 과거 → 유예 경과 → unconf
      'start_time': '14:00',
      'hospital_change_prev_time': null,
      'hospital_change_kind': null,
    });

AppointmentView changedView({required DateTime prev, required DateTime next}) =>
    AppointmentView.fromJson({
      'id': 'a1',
      'status': '예약확정',
      'for_patient_name': '김순자',
      'booking_code': 'A-2413',
      'department_name': '내과',
      'doctor_name': '이의사',
      'has_questionnaire': false,
      'slot_date': next.toIso8601String().substring(0, 10),
      'start_time':
          '${next.hour.toString().padLeft(2, '0')}:${next.minute.toString().padLeft(2, '0')}',
      'hospital_change_prev_time': prev.toIso8601String(),
      'hospital_change_kind': 'changed',
    });

AppointmentView cancelledView() => AppointmentView.fromJson({
      'id': 'a1',
      'status': '예약확정',
      'for_patient_name': '김순자',
      'booking_code': 'A-2413',
      'department_name': '내과',
      'doctor_name': '이의사',
      'has_questionnaire': false,
      'slot_date': '2030-08-18',
      'start_time': '14:00',
      'hospital_change_prev_time': DateTime(2026, 8, 18, 14, 30).toIso8601String(),
      'hospital_change_kind': 'cancelled',
    });

/// 상태 B 공용 뷰 — 오늘 슬롯(유예 전)이라 예약확정이 late로 넘어가지 않는다.
AppointmentView bView(
  String status, {
  String name = '김순자',
  String relation = '본인',
  bool isSelf = true,
  String? code = '241401',
  bool hasQuestionnaire = false,
  String? cancelledBy,
  String? cancelledByRelation,
  String? cancelledByName,
  String? changeKind,
}) {
  final now = DateTime.now();
  final slot = now.add(const Duration(minutes: 10)); // 유예 전
  return AppointmentView.fromJson({
    'id': 'a1',
    'status': status,
    'for_patient_name': name,
    'relation': relation,
    'is_self': isSelf,
    'booking_code': code,
    'department_name': '내과',
    'doctor_name': '이의사',
    'has_questionnaire': hasQuestionnaire,
    'slot_date': slot.toIso8601String().substring(0, 10),
    'start_time': '${slot.hour.toString().padLeft(2, '0')}:${slot.minute.toString().padLeft(2, '0')}',
    'hospital_change_prev_time':
        changeKind != null ? DateTime(2026, 8, 18, 14, 0).toIso8601String() : null,
    'hospital_change_kind': changeKind,
    'cancelled_by': cancelledBy,
    'cancelled_by_relation': cancelledByRelation,
    'cancelled_by_name': cancelledByName,
    'cancelled_at': cancelledBy != null ? DateTime(2026, 8, 18, 9, 0).toIso8601String() : null,
  });
}

/// 예약확정인 채 예약시각 +N분 지난 뷰(late 판정용).
AppointmentView lateView({int minutesPast = 31, String? code = '241401'}) {
  final slot = DateTime.now().subtract(Duration(minutes: minutesPast));
  return AppointmentView.fromJson({
    'id': 'a1',
    'status': '예약확정',
    'for_patient_name': '김순자',
    'relation': '본인',
    'is_self': true,
    'booking_code': code,
    'department_name': '내과',
    'doctor_name': '이의사',
    'has_questionnaire': false,
    'slot_date': slot.toIso8601String().substring(0, 10),
    'start_time': '${slot.hour.toString().padLeft(2, '0')}:${slot.minute.toString().padLeft(2, '0')}',
    'hospital_change_prev_time': null,
    'hospital_change_kind': null,
  });
}

/// AppCard 고정 본문(132px)의 실제 높이. 상태가 바뀌어도 불변임을 확인한다(COMMON-06).
double bodyHeight(WidgetTester t) =>
    t.getSize(find.byKey(const Key('app_card_body'))).height;
