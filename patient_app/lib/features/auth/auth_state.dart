// expiredOffline 신설(갭 #38): 세션이 없는데 '오프라인 중'이라 진짜 로그아웃인지 알 수 없는 상태.
// 이 동안 보관본을 읽기전용으로 계속 보여준다(OFF-AUTH-01) — 로그인 화면으로 튕기지 않는다.
enum AuthStatus { signedOut, signedIn, expiredOffline }

class AuthState {
  const AuthState({required this.status, this.userId});
  final AuthStatus status;
  final String? userId;
}
