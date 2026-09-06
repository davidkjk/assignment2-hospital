import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/providers.dart';
import 'core/router.dart';
import 'core/theme.dart';
import 'features/auth/auth_state.dart';
import 'features/settings/logout_confirm.dart' show pushServiceProvider;

class PatientApp extends ConsumerWidget {
  const PatientApp({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // 로그인·회원가입·앱 재시작(자동 로그인)으로 인증이 signedIn이 되면 FCM 토큰을 등록한다.
    // (로그아웃·탈퇴의 unregister는 SET-OUT-08·SET-QUIT-23에서 별도로 처리한다.)
    // init/registerToken은 여러 번 불려도 무해하다(서버 on conflict, 리스너 1회 배선).
    ref.listen(authStateChangesProvider, (prev, next) {
      if (next.value?.status == AuthStatus.signedIn) {
        debugPrint('[PUSH] signedIn 감지 → init 시작');
        // init()이 내부에서 권한 요청 → 토큰 등록(핵심) → 표시 설정(best-effort) 순으로 처리한다.
        ref.read(pushServiceProvider).init();
      }
    });
    return MaterialApp.router(
      title: '병원 앱',
      theme: AppTheme.theme,
      routerConfig: appRouter,
      // 데모 index.css `html { font-size: 17px }`(어르신 가독성) 재현. 데모는 뿌리 글자를 16→17px로
      // 키우고 rem으로 전 화면을 비례 확대한다. Flutter엔 뿌리 글자 개념이 없어, 전역 textScaler로
      // 같은 17/16 배율을 건다 — 폰트 값은 전부 16px 기준 naive로 두고 크기 확대는 이 한 곳에서만(전역 스위치).
      // 사용자 시스템 글자 크기 설정도 보존한다(기존 배율에 곱함).
      builder: (context, child) {
        final mq = MediaQuery.of(context);
        final factor = mq.textScaler.scale(1) * AppTheme.rootFontScale;
        return MediaQuery(
          data: mq.copyWith(textScaler: TextScaler.linear(factor)),
          child: child!,
        );
      },
    );
  }
}
