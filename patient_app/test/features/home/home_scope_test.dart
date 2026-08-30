import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/home/home_scope.dart';

AppointmentView _v(String id, String status, DateTime slot, {String name = '본인'}) =>
    AppointmentView.fromJson({
      'id': id,
      'status': status,
      'for_patient_name': name,
      'is_self': name == '본인', // 홈 정렬 본인 판정(동명이인 방어 — 이름 아닌 플래그)
      'booking_code': 'A-$id',
      'department_name': '내과',
      'doctor_name': '이의사',
      'has_questionnaire': false,
      'slot_date': slot.toIso8601String().substring(0, 10),
      'start_time': '${slot.hour.toString().padLeft(2, '0')}:00',
      'hospital_change_prev_time': null,
      'hospital_change_kind': null,
    });

void main() {
  final now = DateTime(2026, 8, 18, 9, 0);

  test('[HOME-SCOPE-01] 오늘 예약이 있으면 오늘 하루치만 고른다', () {
    final today = _v('1', '예약확정', DateTime(2026, 8, 18, 14));
    final tomorrow = _v('2', '예약확정', DateTime(2026, 8, 19, 10));
    expect(selectHomeDay([today, tomorrow], now).map((a) => a.id), ['1']); // 내일 것은 빠진다(SCOPE-02)
  });

  test('[HOME-SCOPE-01] 오늘 예약이 없으면 다음 예약이 있는 날 하루치를 고른다', () {
    final d20 = _v('3', '예약확정', DateTime(2026, 8, 20, 11));
    final d22 = _v('4', '예약확정', DateTime(2026, 8, 22, 11));
    expect(selectHomeDay([d22, d20], now).map((a) => a.id), ['3']); // 22일 것은 안 끌어온다
  });

  test('[HOME-SCOPE-03] 오늘이 끝난 카드뿐이면 다음 예약을 끌어오지 않는다', () {
    final doneToday = _v('5', '진료완료', DateTime(2026, 8, 18, 8));
    final next = _v('6', '예약확정', DateTime(2026, 8, 20, 11));
    expect(selectHomeDay([doneToday, next], now).map((a) => a.id), ['5']); // 오늘의 끝난 카드만
  });

  test('[HOME-CARD-04] 하루치를 전부 고른다(첫 건만 꺼내지 않는다)', () {
    final a = _v('7', '예약확정', DateTime(2026, 8, 18, 14), name: '본인');
    final b = _v('8', '예약확정', DateTime(2026, 8, 18, 15), name: '김순자');
    expect(selectHomeDay([a, b], now).length, 2); // list.first가 아니라 그날 전부
  });

  test('[HOME-CARD-03] 같은 날은 빠른 시각이 위, 같은 시각이면 본인이 가족보다 위', () {
    final family = _v('9', '예약확정', DateTime(2026, 8, 18, 14), name: '김순자');
    final me = _v('10', '예약확정', DateTime(2026, 8, 18, 14), name: '본인');
    expect(selectHomeDay([family, me], now).first.id, '10'); // 본인 먼저
  });

  test('[HOME-ROLE-01] 지나간(다른 날 완료) 예약은 홈에 오지 않는다', () {
    final past = _v('11', '진료완료', DateTime(2026, 8, 10, 9));
    final next = _v('12', '예약확정', DateTime(2026, 8, 20, 11));
    expect(selectHomeDay([past, next], now).map((a) => a.id), ['12']); // 과거는 이력 탭 몫
  });
}
