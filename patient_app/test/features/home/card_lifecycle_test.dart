import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';

void main() {
  final now = DateTime(2026, 8, 18, 15, 0);
  AppointmentView v(String status, {DateTime? slot}) => AppointmentView.fromJson({
        'id': 'a',
        'status': status,
        'for_patient_name': '본인',
        'booking_code': 'A-1',
        'department_name': '내과',
        'doctor_name': '이의사',
        'has_questionnaire': false,
        'slot_date': slot?.toIso8601String().substring(0, 10),
        'start_time': slot == null
            ? null
            : '${slot.hour.toString().padLeft(2, '0')}:${slot.minute.toString().padLeft(2, '0')}',
        'hospital_change_prev_time': null,
        'hospital_change_kind': null,
      });

  test('[CARD-LIFE-01] 끝난 카드는 진료완료·취소됨 둘뿐이다', () {
    expect(isFinishedCard(resolveCardState(v('진료완료'), now)), isTrue);
    expect(isFinishedCard(resolveCardState(v('병원취소'), now)), isTrue);
    expect(isFinishedCard(resolveCardState(v('환자취소'), now)), isTrue);
    for (final s in ['예약확정', '도착', '진료대기', '진료중']) {
      expect(isFinishedCard(resolveCardState(v(s, slot: now), now)), isFalse);
    }
  });

  test('[CARD-LIFE-02][CARD-LATE-11] 시간 지남(+30분 경과 예약확정)은 끝난 카드가 아니다', () {
    final late =
        resolveCardState(v('예약확정', slot: now.subtract(const Duration(minutes: 31))), now);
    expect(late, AppointmentCardState.late);
    expect(isFinishedCard(late), isFalse);
  });

  test('[CARD-LATE-00] 예약확정은 예약시각 +30분 전까지는 late로 넘어가지 않는다', () {
    final ok = resolveCardState(v('예약확정', slot: now.subtract(const Duration(minutes: 20))), now);
    expect(ok, AppointmentCardState.confirmed);
  });

  test('[CARD-DOC/DONE/CXL] 상태 B가 각 케이스로 확정된다', () {
    expect(resolveCardState(v('도착', slot: now), now), AppointmentCardState.arrived);
    expect(resolveCardState(v('진료중', slot: now), now), AppointmentCardState.inTreatment);
    expect(resolveCardState(v('진료완료', slot: now), now), AppointmentCardState.done);
    expect(resolveCardState(v('병원취소', slot: now), now), AppointmentCardState.cancelled);
  });

  test('[CARD-COMMON-04] 배지 문구는 환자 말(데모 BADGE_LABEL) — 내부어 없음', () {
    expect(patientStatusLabel(AppointmentCardState.confirmed), '확정됨');
    expect(patientStatusLabel(AppointmentCardState.arrived), '접수됐어요');
    expect(patientStatusLabel(AppointmentCardState.inTreatment), '진료 중');
    expect(patientStatusLabel(AppointmentCardState.done), '진료가 끝났습니다');
    expect(patientStatusLabel(AppointmentCardState.cancelled), '취소됨');
    expect(patientStatusLabel(AppointmentCardState.late), '시간 지남');
    // 내부어 노출 금지
    for (final label in [
      patientStatusLabel(AppointmentCardState.late),
      patientStatusLabel(AppointmentCardState.done),
    ]) {
      expect(label.contains('부도'), isFalse);
    }
  });
}
