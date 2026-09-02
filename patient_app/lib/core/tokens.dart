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

  // patientApp.body — 본문 기본 크기(테마 bodyLarge에 쓰인다). 데모 루트 17px(어르신 가독성).
  static const double bodyFontSize = 17.0;

  // patientApp.density — 데모(조밀 shadcn) 밀도 토큰. 리스트·카드 성김을 데모에 맞춘다.
  static const double densityCardRadius = 14.0; // patientApp.density.cardRadius
  static const double densityRowPad = 12.0; // 컴팩트 행 안쪽 여백
  static const double densityRowGap = 12.0; // 아이콘↔글자
  static const double densityListGap = 8.0; // 행 사이
  static const double densitySectionGap = 24.0; // 날짜 섹션 사이

  // patientApp.button — 데모 Button 크기 체계(사용자 확정 2026-09-01: 데모 3단계 그대로).
  // 루트 17px이라 rem 값이 비례로 커진 실제 픽셀. 굵기는 font-medium(500) — bold 아님.
  //   cta  = h-12 text-base (로그인·가입·최종확인·[예약하기] 등 전체폭 주요 행동, 화면당 1개)
  //   tall = h-11 text-sm   (비밀번호 변경 제출·인증번호 재전송)
  //   lg   = h-9  text-sm   (가족 추가·수정 제출)
  //   base = h-8  text-sm   (마법사 [이전]/[다음]·상세 [변경]/[취소]·[홈으로] 등 기본)
  //   sm   = h-7  text-xs   (알림 카드 안·가족 목록 [추가]·문진 확인 [수정])
  static const double buttonRadius = 10.625; // rounded-lg = --radius 0.625rem
  static const double buttonPadX = 10.625; // px-2.5
  static const FontWeight buttonWeight = FontWeight.w500;
  static const double buttonCtaHeight = 51.0;
  static const double buttonCtaFont = 17.0;
  static const double buttonTallHeight = 46.75;
  static const double buttonTallFont = 14.875;
  static const double buttonLgHeight = 38.25;
  static const double buttonLgFont = 14.875;
  static const double buttonBaseHeight = 34.0;
  static const double buttonBaseFont = 14.875;
  static const double buttonSmHeight = 29.75;
  static const double buttonSmFont = 13.6;

  // 데모 --elevation-card: 테두리 없이 카드를 띄우는 딥틸 톤(patientApp.cardShadow) 3겹 그림자.
  // 한 곳에서 조절하면 전 카드에 반영된다(테두리 선 대신 그림자 — DESIGN-NOTES 「그림자·경계 시스템」).
  // ⚠️ Flutter 그림자는 CSS와 같은 숫자여도 더 세게/아래로 쏠려 "붙은 것처럼" 보인다 →
  //    데모 웹의 은은한 떠오름과 시각적으로 맞도록 오프셋·블러·농도를 낮춘다(값=데모 눈대조 결과).
  // 부드러운 후광 — 카드에 가깝게 잡는다. 카드가 촘촘히 쌓여(간격 8) 아래 카드가 위 그림자를
  // 자르므로, 오프셋·블러를 작게 해 잘림(하드 라인)을 최소화한다. 그림자는 바깥 Container에 그림.
  static const List<BoxShadow> cardElevation = [
    BoxShadow(color: Color(0x0D102D32), blurRadius: 14), // 사방 고른 앰비언트
    BoxShadow(color: Color(0x1A102D32), blurRadius: 18, offset: Offset(0, 3)), // 아래로 은은히(가깝게)
  ];
}
