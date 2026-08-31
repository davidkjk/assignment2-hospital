import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/router.dart';

// NAV-SET-01·02 / SET-HOME-02·03: 설정 하위는 전부 민감 경로 — T14 가드(_isSensitive)가 이미 덮는다.
// 화면 자체의 배선(→ SettingsHomeScreen 등)은 settings_home_test·hospital_info_test·notification_settings_test가 확인한다.
void main() {
  test('[NAV-SET-01·02] 설정 홈·알림·병원은 모두 민감 경로', () {
    expect(isSensitiveLocation('/settings'), isTrue);
    expect(isSensitiveLocation('/settings/notifications'), isTrue);
    expect(isSensitiveLocation('/settings/hospital'), isTrue);
    expect(isSensitiveLocation('/settings/password'), isTrue);
    expect(isSensitiveLocation('/settings/withdraw'), isTrue);
  });
}
