import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';

AppointmentView _v(String status, {DateTime? slot}) => AppointmentView.fromJson({
      'id': 'a1',
      'status': status,
      'for_patient_name': '김순자',
      'booking_code': null,
      'department_name': '내과',
      'doctor_name': '이의사',
      'has_questionnaire': false,
      'slot_date': slot?.toIso8601String().substring(0, 10),
      'start_time': slot == null ? null : '14:00',
      'hospital_change_prev_time': null,
      'hospital_change_kind': null,
    });

void main() {
  final base = DateTime(2026, 8, 18, 14, 0);

  test('[CARD-REQ-01] 예약신청이고 유예(30분) 전이면 확인 중 카드', () {
    expect(resolveCardState(_v('예약신청', slot: base), base.add(const Duration(minutes: 10))),
        AppointmentCardState.req);
  });
  test('[CARD-UNCONF-02] 예약신청인 채 예약 시각 +30분을 넘기면 확정되지 않음 카드', () {
    expect(resolveCardState(_v('예약신청', slot: base), base.add(const Duration(minutes: 31))),
        AppointmentCardState.unconf);
  });
  test('[CARD-WAIT-03] 진료대기 상태만 wait 본문을 받는다(다른 상태엔 대기 문장이 없다)', () {
    expect(resolveCardState(_v('진료대기'), base), AppointmentCardState.wait);
    expect(resolveCardState(_v('예약확정', slot: base), base), isNot(AppointmentCardState.wait));
  });
  test('[CARD-COMMON-04] 카드 상태 라벨은 병원 내부 이름을 그대로 노출하지 않는다', () {
    // 서버 내부 이름 '진료대기'가 상태 라벨 문구에 그대로 나오지 않는다(환자 말로 바꾼다).
    expect(patientStatusLabel(AppointmentCardState.wait), isNot(contains('진료대기')));
  });
  test('[CARD-UNCONF-11] 확정되지 않음은 끝난 카드가 아니다(살아 있는 카드)', () {
    expect(isFinishedCard(AppointmentCardState.unconf), isFalse);
  });
}
