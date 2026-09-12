import 'package:flutter_riverpod/flutter_riverpod.dart';

/// AUTH-REAUTH-04 — 민감 화면을 떠난 뒤 5분 초과 후 재진입하면 비밀번호를 다시 묻는다.
/// Task 11 라우터가 `sensitiveReauthGuardProvider`를 이미 부른다(여기서 실제 판정으로 채운다).
class SensitiveReauthGuard {
  SensitiveReauthGuard({DateTime Function()? now}) : _now = now ?? DateTime.now;
  final DateTime Function() _now;
  DateTime? _lastPassedAt;
  static const window = Duration(minutes: 5); // 요구사항 4.1「민감한 화면」

  bool get needsReauth {
    final t = _lastPassedAt;
    if (t == null) return true; // 아직 한 번도 재인증을 통과하지 않았다
    return _now().difference(t) > window; // 5분 초과면 다시 묻는다
  }

  void markPassed() => _lastPassedAt = _now(); // 재인증 성공 시각 기록
}

final sensitiveReauthGuardProvider =
    Provider<SensitiveReauthGuard>((ref) => SensitiveReauthGuard());
