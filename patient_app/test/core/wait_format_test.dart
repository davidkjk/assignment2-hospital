import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/wait_format.dart';

void main() {
  test('[CARD-WAIT-05] 내 앞 0명이면 분이 아니라 곧 들어가십니다', () {
    expect(formatWaitTime(patientsAhead: 0, minutes: 0), '곧 들어가십니다');
  });
  test('[CARD-WAIT-06] 60분을 넘으면 정확한 분 대신 약 1시간 이상', () {
    expect(formatWaitTime(patientsAhead: 5, minutes: 75), '예상 대기시간 약 1시간 이상');
  });
  test('[CARD-WAIT-07] 5분 단위로 반올림하고 약을 반드시 붙인다', () {
    expect(formatWaitTime(patientsAhead: 2, minutes: 23), '예상 대기시간 약 25분'); // 23→25 반올림, 약
  });
  test('[CARD-WAIT-04] 근거 분이 없으면(null) 대기시간 줄을 만들지 않는다', () {
    expect(formatWaitTime(patientsAhead: 2, minutes: null), ''); // 인원만 보이고 시간 문구는 빈 문자열
  });

  test('[CARD-CHG-02] 시각은 오전/오후 h:mm으로 바꾼다', () {
    expect(formatKoreanTime(DateTime(2026, 8, 18, 14, 30)), '오후 2:30');
    expect(formatKoreanTime(DateTime(2026, 8, 18, 16, 0)), '오후 4:00');
    expect(formatKoreanTime(DateTime(2026, 8, 18, 0, 5)), '오전 12:05');
  });
}
