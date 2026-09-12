import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/sensitive_reauth.dart';

void main() {
  test('[AUTH-REAUTH-04] 한 번도 통과 안 했으면 재인증이 필요하다', () {
    final g = SensitiveReauthGuard(now: () => DateTime(2026, 1, 1, 12, 0));
    expect(g.needsReauth, isTrue);
  });

  test('[AUTH-REAUTH-04] 통과 직후 5분 이내면 다시 묻지 않는다', () {
    var t = DateTime(2026, 1, 1, 12, 0);
    final g = SensitiveReauthGuard(now: () => t);
    g.markPassed();
    t = DateTime(2026, 1, 1, 12, 4, 59); // 4분 59초 뒤
    expect(g.needsReauth, isFalse);
  });

  test('[AUTH-REAUTH-04] 5분을 넘기면 다시 묻는다', () {
    var t = DateTime(2026, 1, 1, 12, 0);
    final g = SensitiveReauthGuard(now: () => t);
    g.markPassed();
    t = DateTime(2026, 1, 1, 12, 5, 1); // 5분 1초 뒤
    expect(g.needsReauth, isTrue);
  });
}
