import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/settings/hospital_hours_format.dart';

// ⚠️ weekday 규약은 서버(00041)와 같은 Python 월=0 … 일=6 — 0~4 평일, 5 토요일, 6 일요일.

void main() {
  test('[SET-HOSP-05] 평일·토요일·점심시간·휴진일 네 줄로 접는다', () {
    final lines = formatHospitalHours(HospitalHours(
      weekdays: [
        for (var wd = 0; wd <= 4; wd++)
          Day(wd, open: '09:00', close: '18:00', lunchStart: '12:30', lunchEnd: '14:00'),
        const Day(5, open: '09:00', close: '13:00'),   // 토요일 반일
        const Day(6, isClosed: true),                  // 일요일 휴진
      ],
      closures: [const Closure('2026-08-21', '창립기념일')],
    ));
    expect(lines.weekday, '평일 09:00–18:00');
    expect(lines.saturday, '토요일 09:00–13:00');
    expect(lines.lunch, '점심시간 12:30–14:00');
    expect(lines.closed, contains('일요일'));
    expect(lines.closed, contains('8월 21일 창립기념일')); // 예정 휴진도 휴진일 줄에
  });

  test('[SET-HOSP-05] 평일이 서로 다르면 요일별로 편다(억지로 묶지 않는다)', () {
    final lines = formatHospitalHours(HospitalHours(weekdays: [
      const Day(0, open: '09:00', close: '18:00'),
      const Day(1, open: '09:00', close: '17:00'),
      for (var wd = 2; wd <= 6; wd++) Day(wd, isClosed: true),
    ], closures: []));
    expect(lines.weekday, contains('월요일')); // 묶을 수 없으면 요일별
    expect(lines.weekday, contains('화요일'));
  });

  test('[SET-HOSP-05] 토요일 휴진이면 saturday 줄이 비고 휴진일에 토요일이 든다', () {
    final lines = formatHospitalHours(HospitalHours(weekdays: [
      for (var wd = 0; wd <= 4; wd++) Day(wd, open: '09:00', close: '18:00'),
      const Day(5, isClosed: true),
      const Day(6, isClosed: true),
    ], closures: []));
    expect(lines.saturday, isEmpty);
    expect(lines.closed, contains('토요일'));
    expect(lines.closed, contains('일요일'));
  });
}
