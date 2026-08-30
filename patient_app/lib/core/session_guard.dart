import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'connectivity.dart';
import 'providers.dart';
import '../features/auth/auth_state.dart';

// 오프라인 중 401(만료 추정)을 받은 적이 있음 — 온라인 복구 시 초기화되고 진짜 재로그인으로 넘어간다.
final expiredOfflineProvider = StateProvider<bool>((_) => false);

// ⭐ 세 신호를 합쳐 '실효 인증 상태'를 낸다(갭 #38). 화면·라우터는 authStateChangesProvider가 아니라 이걸 본다.
final effectiveAuthProvider = Provider<AuthStatus>((ref) {
  final base = ref.watch(authStateChangesProvider).valueOrNull?.status ?? AuthStatus.signedOut;
  final online = ref.watch(connectivityProvider).valueOrNull ?? true;
  final offlineExpired = ref.watch(expiredOfflineProvider);
  if (base == AuthStatus.signedIn) return AuthStatus.signedIn;
  if (!online && offlineExpired) return AuthStatus.expiredOffline;   // OFF-AUTH-01: 읽기전용 유지, 로그인 안 보냄
  return AuthStatus.signedOut;                                       // OFF-AUTH-04·NAV-GLOBAL-03: 온라인 401만 여기
});

// ApiClient가 401을 받으면 부른다(router 배선). OFF-AUTH-04: 네트워크 실패와 인증 실패를 구분한다.
Future<void> handleUnauthorized(Ref ref) async {
  final online = ref.read(connectivityProvider).valueOrNull ?? true;
  if (online) {
    ref.read(expiredOfflineProvider.notifier).state = false;
    await ref.read(supabaseClientProvider).auth.signOut();          // → session null → 라우터가 /login (NAV-GLOBAL-03)
  } else {
    ref.read(expiredOfflineProvider.notifier).state = true;         // 지하 대기실 튕김 방지(갭 #38 · OFF-AUTH-01)
  }
}

// ── Task 13(가입·재인증)과의 양방향 악수 — 여기선 스텁(no-op), Task 13이 실제 판정으로 override ──
// NAV-GLOBAL-04(갭 #43): 인증됐지만 프로필 미완료면 가입 ③으로. Task 13이 GET /patient/me 403 판정으로 교체한다.
//   기본은 '완료됨'(false) — 스텁 상태에선 아무도 /signup/step3로 튕기지 않는다.
final profileMissingProvider = Provider<bool>((_) => false);

// NAV-GLOBAL-05: 민감 경로(설정·가족·탈퇴)에 5분 이상 떠났다 오면 재인증(AUTH-REAUTH-*). Task 13이 실제 판정 채움.
class SensitiveReauthGuard {
  const SensitiveReauthGuard({this.needsReauth = false});
  final bool needsReauth;
}

final sensitiveReauthGuardProvider =
    Provider<SensitiveReauthGuard>((_) => const SensitiveReauthGuard());
