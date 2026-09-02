import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/appointments/my_appointments_data.dart';

AppointmentView _v(String status, String date, String time, {String name = '본인'}) =>
    AppointmentView.fromJson({
      'id': '$date-$time-$name',
      'status': status,
      'for_patient_name': name,
      'is_self': name == '본인',
      'department_name': '내과',
      'doctor_name': '이의사',
      'booking_code': 'A',
      'has_questionnaire': false,
      'slot_date': date,
      'start_time': time,
      'support_requested_at': null,
      'request_type': null,
      'hospital_change_prev_time': null,
      'hospital_change_kind': null,
    });

void main() {
  test('[LIST-ROLE-03][LIST-ROLE-04] 오늘 예약도 목록에 남고 5상태가 모두 담긴다', () {
    final filtered = filterUpcoming([
      _v('진료중', '2026-09-01', '09:00'), // 오늘 병원에 와 있는 것도 목록에 남는다
      _v('예약확정', '2026-09-03', '10:00'),
    ]);
    expect(filtered.length, 2);
  });
  test('[LIST-ROLE-05][LIST-ROLE-06][LIST-ROLE-10] 진료완료·취소됨·부도는 목록에서 빠진다(#75 화면 필터)', () {
    final filtered = filterUpcoming([
      _v('진료완료', '2026-09-01', '09:00'), // 끝난 즉시 빠진다(홈만 자정까지)
      _v('병원취소', '2026-09-01', '10:00'),
      _v('예약부도', '2026-09-01', '11:00'),
      _v('예약확정', '2026-09-02', '10:00'),
    ]);
    expect(filtered.map((a) => a.status), ['예약확정']);
  });
  test('[LIST-ROLE-07] 본인과 가족을 한 목록에 섞는다', () {
    final filtered = filterUpcoming([
      _v('예약확정', '2026-09-02', '10:00', name: '본인'),
      _v('예약확정', '2026-09-02', '11:00', name: '딸'),
    ]);
    expect(filtered.map((a) => a.forPatientName), ['본인', '딸']);
  });
  test('[LIST-ROLE-08][LIST-ROLE-09] 건수 제한·20건 이어받기가 없다 — 들어온 것 전부를 한 번에 담는다', () {
    final many = List.generate(
        35, (i) => _v('예약확정', '2026-10-${((i % 28) + 1).toString().padLeft(2, '0')}', '10:00'));
    expect(filterUpcoming(many).length, 35); // 잘라내지 않는다
  });
  test('[LIST-LIST-01][LIST-LIST-04][LIST-LIST-05] 날짜가 바뀌는 자리마다 헤더, 오늘도 헤더를 붙이고 건수를 센다', () {
    final sections = groupByDate([
      _v('진료대기', '2026-09-01', '09:00'), // 오늘
      _v('예약확정', '2026-09-01', '10:30'),
      _v('예약확정', '2026-09-03', '14:00'),
    ]);
    expect(sections.map((s) => s.date), [DateTime(2026, 9, 1), DateTime(2026, 9, 3)]);
    expect(sections.first.items.length, 2); // 그날 건수 = 2 (LIST-LIST-04)
    expect(sections.first.date, DateTime(2026, 9, 1)); // 오늘도 '오늘'로 바꿔치기하지 않는다(LIST-LIST-05)
  });
}
