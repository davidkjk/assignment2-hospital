import 'package:flutter/material.dart';
import 'core/router.dart';
import 'core/theme.dart';

class PatientApp extends StatelessWidget {
  const PatientApp({super.key});
  @override
  Widget build(BuildContext context) {
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
