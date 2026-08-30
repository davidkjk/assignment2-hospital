import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'session_guard.dart';
import '../features/auth/auth_state.dart';

// NAV-GLOBAL-05: 민감 경로(설정·가족·탈퇴). 탈퇴는 /settings 하위.
bool _isSensitive(String loc) => loc.startsWith('/settings') || loc.startsWith('/family');

// 전역 redirect 정책(순수 함수 — router_guard_test가 직접 부른다). NAV-GLOBAL-03·04·05.
String? computeRedirect({
  required AuthStatus auth,
  required bool profileMissing,
  required bool needsReauth,
  required String loc,
}) {
  final protected = !loc.startsWith('/login') && !loc.startsWith('/signup');
  // NAV-GLOBAL-03: 진짜 로그아웃(온라인 401)만 로그인으로. expiredOffline은 여기서 안 걸린다.
  if (auth == AuthStatus.signedOut && protected) return '/login';
  // OFF-AUTH-01: expiredOffline이면 캐시 읽기전용 화면 유지 — 로그인으로 보내지 않는다.
  if (auth == AuthStatus.expiredOffline) return null;
  // NAV-GLOBAL-04(갭 #43): 인증됐지만 프로필 미완료면 가입 ③으로(profileMissingProvider는 Task 13이 채운다).
  if (auth == AuthStatus.signedIn && profileMissing && !loc.startsWith('/signup')) {
    return '/signup/step3';
  }
  // NAV-GLOBAL-05: 민감 경로이고 떠난 지 5분 지났으면 재인증 먼저(Task 13 AUTH-REAUTH-*).
  if (_isSensitive(loc) && needsReauth) return '/reauth?next=$loc';
  return null;
}

/// 라우트 골격. 각 화면 위젯은 이후 태스크(13~31)가 이 파일의 builder를 교체한다.
final GoRouter appRouter = GoRouter(
  initialLocation: '/login',
  // 전역 가드: effectiveAuthProvider(세 신호 합성)를 읽어 어디로 갈지/안 갈지 정한다.
  redirect: (context, state) {
    final container = ProviderScope.containerOf(context);
    return computeRedirect(
      auth: container.read(effectiveAuthProvider),
      profileMissing: container.read(profileMissingProvider),
      needsReauth: container.read(sensitiveReauthGuardProvider).needsReauth,
      loc: state.matchedLocation,
    );
  },
  routes: [
    GoRoute(path: '/login', builder: (c, s) => const _Placeholder('로그인')),
    GoRoute(path: '/signup', builder: (c, s) => const _Placeholder('회원가입')),
    GoRoute(path: '/signup/step3', builder: (c, s) => const _Placeholder('가입 ③ 프로필')),
    GoRoute(path: '/reauth', builder: (c, s) => const _Placeholder('재인증')),
    GoRoute(path: '/home', builder: (c, s) => const _Placeholder('홈')),
    GoRoute(path: '/booking', builder: (c, s) => const _Placeholder('예약')),
    GoRoute(path: '/family', builder: (c, s) => const _Placeholder('가족관리')),
    GoRoute(path: '/appointments/:id', builder: (c, s) => _Placeholder('예약 상세 ${s.pathParameters['id']}')),
    GoRoute(path: '/history', builder: (c, s) => const _Placeholder('방문이력')),
    GoRoute(path: '/settings', builder: (c, s) => const _Placeholder('설정')),
  ],
);

class _Placeholder extends StatelessWidget {
  const _Placeholder(this.label);
  final String label;
  @override
  Widget build(BuildContext context) => Scaffold(body: Center(child: Text(label)));
}
