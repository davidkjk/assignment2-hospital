import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/router.dart';

void main() {
  test('[NAV-LIST-01] 하단 예약 탭의 목적지는 목록(/my)이다 — 예약 마법사(/booking)가 아니다', () {
    expect(appointmentsTabRoute, '/my');
  });
  test('[NAV-LIST-13] 목록 경로는 민감 화면(재인증 대상)이 아니다', () {
    expect(isSensitiveLocation('/my'), isFalse); // 가족·설정과 다르다(이력과 같다)
  });
}
