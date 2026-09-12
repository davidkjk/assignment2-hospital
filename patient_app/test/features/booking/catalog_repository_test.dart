import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/booking/catalog_repository.dart';

void main() {
  test('[BOOK-DOC-05] Doctor.fromJson: photo_url null → photoUrl null', () {
    final d = Doctor.fromJson(
        {'id': 'd1', 'name': '김의사', 'specialty': '소화기', 'photo_url': null, 'schedule_summary': '월 오전'});
    expect(d.photoUrl, isNull);
    expect(d.specialty, '소화기');
    expect(d.scheduleSummary, '월 오전');
  });

  test('[BOOK-DOC-09] Doctor.fromJson: schedule_summary 누락 → "진료시간 문의"', () {
    final d = Doctor.fromJson({'id': 'd2', 'name': '이의사', 'specialty': null, 'photo_url': null});
    expect(d.scheduleSummary, '진료시간 문의');
    expect(d.specialty, isNull);
  });

  test('[BOOK-DEPT-01] Department.fromJson: id·name 파싱', () {
    final dep = Department.fromJson({'id': 'x', 'name': '내과'});
    expect(dep.id, 'x');
    expect(dep.name, '내과');
  });
}
