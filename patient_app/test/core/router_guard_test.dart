import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/router.dart';
import 'package:hospital_patient_app/features/auth/auth_state.dart';

void main() {
  test('signedOut + 보호경로 → /landing (NAV-GLOBAL-03·#40 가입 입구가 랜딩에 있음)', () {
    expect(computeRedirect(auth: AuthStatus.signedOut, profileMissing: false, needsReauth: false, loc: '/home'),
        '/landing');
  });

  test('signedOut + 랜딩/로그인/가입 경로는 그대로', () {
    expect(computeRedirect(auth: AuthStatus.signedOut, profileMissing: false, needsReauth: false, loc: '/landing'),
        isNull);
    expect(computeRedirect(auth: AuthStatus.signedOut, profileMissing: false, needsReauth: false, loc: '/login'),
        isNull);
    expect(computeRedirect(auth: AuthStatus.signedOut, profileMissing: false, needsReauth: false, loc: '/signup'),
        isNull);
  });

  test('expiredOffline → 리다이렉트 없음, 읽기전용 유지 (OFF-AUTH-01)', () {
    expect(computeRedirect(auth: AuthStatus.expiredOffline, profileMissing: false, needsReauth: false, loc: '/home'),
        isNull);
  });

  test('signedIn + 프로필 미완료 → /signup/step3 (NAV-GLOBAL-04)', () {
    expect(computeRedirect(auth: AuthStatus.signedIn, profileMissing: true, needsReauth: false, loc: '/home'),
        '/signup/step3');
  });

  test('signedIn + 프로필 완료 → 통과', () {
    expect(computeRedirect(auth: AuthStatus.signedIn, profileMissing: false, needsReauth: false, loc: '/home'),
        isNull);
  });

  test('민감 경로 + 재인증 필요 → /reauth?next= (NAV-GLOBAL-05)', () {
    expect(computeRedirect(auth: AuthStatus.signedIn, profileMissing: false, needsReauth: true, loc: '/settings'),
        '/reauth?next=/settings');
    // 비민감 경로는 재인증 안 건다.
    expect(computeRedirect(auth: AuthStatus.signedIn, profileMissing: false, needsReauth: true, loc: '/home'),
        isNull);
  });
}
