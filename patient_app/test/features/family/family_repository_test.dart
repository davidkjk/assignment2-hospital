import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/family/family_repository.dart';

void main() {
  test('FamilyMember.fromJson은 서버 판정을 그대로 싣는다 — 앱이 다시 계산하지 않는다', () {
    final m = FamilyMember.fromJson({
      'id': 'p1', 'name': '홍길동', 'birth_date': '1950-01-01', 'gender': 'M',
      'relation': '부모', 'is_self': false, 'phone': '01011112222', 'phone_borrowed': true,
      'has_visit_history': false, 'can_edit_identity': false, 'identity_lock_reason': 'linked',
      'upcoming': {'appointment_id': 'a1', 'slot_date': '2026-09-01',
                   'start_time': '14:00:00', 'department_name': '내과'},
    });
    expect(m.canEditIdentity, isFalse);            // 서버 값 그대로
    expect(m.identityLockReason, 'linked');
    expect(m.upcoming!.appointmentId, 'a1');
    expect(m.phoneBorrowed, isTrue);               // 보호자 번호를 빌려 쓰는 가족(#3)
  });

  test('upcoming이 null이면 다가오는 예약 줄이 없다', () {
    final m = FamilyMember.fromJson({
      'id': 'p1', 'name': '홍길동', 'birth_date': '1950-01-01', 'gender': 'M',
      'relation': '부모', 'is_self': false, 'phone': null, 'phone_borrowed': false,
      'has_visit_history': true, 'can_edit_identity': false, 'identity_lock_reason': 'has_history',
      'upcoming': null});
    expect(m.upcoming, isNull);
  });

  test('UpcomingBrief.fromJson은 409 context 모양을 그대로 읽는다 — UnlinkBlocked이 소비', () {
    final u = UpcomingBrief.fromJson({
      'appointment_id': 'a9', 'slot_date': '2026-09-01',
      'start_time': '09:00:00', 'department_name': '정형외과'});
    expect(u.appointmentId, 'a9');
    expect(u.departmentName, '정형외과');
  });
}
