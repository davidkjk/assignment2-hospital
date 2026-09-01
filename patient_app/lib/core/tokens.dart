import 'package:flutter/material.dart';

// 생성된 파일 — 편집하지 않는다. design-tokens/tokens.json에서 생성됨(build.mjs buildDart).
// 화면 코드는 색·크기·카드 규격을 여기서만 가져온다(하드코딩 금지). 테마 조립은 core/theme.dart.
class AppTokens {
  AppTokens._();

  // DISP-GRAY-01/02/03 — 회색은 두 진하기뿐. 새 색을 만들지 않는다.
  static const Color grayPending = Color(0xFF7E8E99); // patientApp.grayPending (아직 안 된 일)
  static const Color grayDone = Color(0xFFA3AFB8); // color.gray-past (이미 끝난 일)
  static const List<Color> grays = [grayPending, grayDone];

  // 상태 배지 색(데모 StatusBadge 톤 정본): 확정=teal(primary)·미확정=amber·대기=sky·접수=violet·부도=slate.
  static const Color badgeAmber = Color(0xFFF59E0B); // 확인 중·확정되지 않음
  static const Color badgeSky = Color(0xFF0284C7); // 진료 대기
  static const Color badgeViolet = Color(0xFF7C3AED); // 접수됐어요
  static const Color badgeSlate = Color(0xFF64748B); // 시간 지남
  static const Color badgeOnColor = Colors.white; // 색 배지 위 글자

  // DISP-WARN-01 — 주의색(color.warn 통일): 배경 없이 글자 + 좌측 바.
  static const Color warn = Color(0xFFB44E00);
  static const double warnBarWidth = 4.0;

  // OFF-BAN-02 — 오프라인 상태 띠 배경(옅은 주황). '주의색 배경 금지'의 예외 1건(전면 상태 배너 한정).
  static const Color offlineBannerBg = Color(0xFFFFF0DC);

  // BTN-STATE-01/02 — 딥틸(primary). 평소=진한 딥틸, 처리 중=흐린 딥틸(회색 아님).
  // 값 근거: 목업 --primary:#0B6E70(66회). 처리 중 흐림은 primary를 알파로 낮춘 계열(≈.75).
  static const Color primary = Color(0xFF0B6E70); // color.primary 재사용
  static const Color primaryBusy = Color(0xBF0B6E70); // patientApp.primaryBusy(알파 0xBF≈.75 — 회색으로 칠하지 않는다)

  // DISP-CARD-01 — 카드 본문 높이 고정.
  static const double cardBodyHeight = 132.0;

  // 화면 바탕·면 색(데모 index.css 정본): 페이지 배경(살짝 쿨한 블루그레이)·카드 면(순백)·
  // 경계선(옅은 쿨 그레이)·muted 띠 바탕·본문 글자(진회색).
  static const Color background = Color(0xFFF2F5F7);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color border = Color(0xFFD5DBDF);
  static const Color muted = Color(0xFFEDF0F2);
  static const Color onSurface = Color(0xFF1F2937);

  // patientApp.body — 본문 기본 크기(테마 bodyLarge에 쓰인다).
  static const double bodyFontSize = 15.0;

  // patientApp.density — 데모(조밀 shadcn) 밀도 토큰. 리스트·카드 성김을 데모에 맞춘다.
  // 값 근거: 데모 카드 rounded-lg=12·리스트 행 px-3/py-3=12·아이콘↔글자 gap-3=12·행간 gap-2=8·날짜섹션 gap-6=24.
  static const double densityCardRadius = 12.0; // patientApp.density.cardRadius
  static const double densityRowPad = 12.0; // patientApp.density.rowPad (컴팩트 행 안쪽 여백)
  static const double densityRowGap = 12.0; // patientApp.density.rowGap (아이콘↔글자)
  static const double densityListGap = 8.0; // patientApp.density.listGap (행 사이)
  static const double densitySectionGap = 24.0; // patientApp.density.sectionGap (날짜 섹션 사이)
}
