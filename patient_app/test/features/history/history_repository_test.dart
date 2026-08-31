import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/history/history_repository.dart';

Map<String, dynamic> _row(String vs, {String? by, String? rel, String? name, bool self = true, bool qnr = false}) => {
      'id': 'ap1', 'status': '병원취소', 'slot_date': '2026-02-10',
      'department_name': '내과', 'doctor_name': '이의사', 'patient_visible_notes': null,
      'visit_status': vs, 'has_questionnaire': qnr, 'is_self': self,
      'cancelled_by': by, 'cancelled_by_relation': rel, 'cancelled_by_name': name,
      'cancelled_at': by == null ? null : '2026-02-05T15:12:00',
    };

void main() {
  test('[HIST-ROLE-03] 서버 4상태를 4개 enum으로 옮긴다', () {
    expect(visitStatusFromServer('진료완료'), VisitStatus.done);
    expect(visitStatusFromServer('취소됨'), VisitStatus.cancelled);
    expect(visitStatusFromServer('방문하지않음'), VisitStatus.noShow);
    expect(visitStatusFromServer('확정되지않음'), VisitStatus.unconfirmed);
  });
  test('[HIST-ROW-02] 취소 주체 4필드를 담는다(카드와 같은 의미)', () {
    final e = VisitHistoryEntry.fromJson(_row('취소됨', by: 'patient', rel: '배우자', name: '김순자', self: false));
    expect(e.cancelledBy, 'patient');
    expect(e.cancelledByRelation, '배우자');
    expect(e.cancelledByName, '김순자');
    expect(e.isSelf, false);
  });
  test('[HIST-ROW-03] 취소 시각을 담는다', () {
    final e = VisitHistoryEntry.fromJson(_row('취소됨', by: 'hospital'));
    expect(e.cancelledAt, DateTime.parse('2026-02-05T15:12:00'));
  });
  test('[HIST-ROLE-06] 서버가 내려준 patient_visible_notes만 담는다(증상·진단은 아예 없다)', () {
    final e = VisitHistoryEntry.fromJson({..._row('진료완료'), 'patient_visible_notes': '휴식하세요'});
    expect(e.patientVisibleNotes, '휴식하세요');
    // 모델에 symptoms·diagnosis 같은 칸이 없다 — 서버가 안 보내므로 담을 자리도 없다.
  });
}
