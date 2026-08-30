import 'package:flutter/material.dart';

// ⚠️ 원래 "생성 파일"로 두려 했으나 design-tokens/build.mjs엔 Dart 생성 경로가 없어(CSS만) 실상 수동 소스다.
// 색·크기·카드 규격은 여기서만 가져온다(화면 코드 하드코딩 금지). 값 근거는 demo(정본 시각) + tokens.json.
class AppTokens {
  AppTokens._();

  // DISP-GRAY-01/02/03 — 회색은 두 진하기뿐. 새 색을 만들지 않는다.
  static const Color grayPending = Color(0xFF7E8E99); // patientApp.grayPending (아직 안 된 일)
  static const Color grayDone = Color(0xFFA3AFB8); // color.gray-past (이미 끝난 일)

  // 상태 배지 색(데모 StatusBadge 톤 정본): 예약확정=teal(primary)·예약신청/미확정=amber·진료대기=sky·
  //   도착(접수)=violet·부도=slate. 흰 글자 알약(rounded-full). CARD-COMMON-05(색+글자 함께).
  static const Color badgeAmber = Color(0xFFF59E0B); // amber-500 (확인 중·확정되지 않음)
  static const Color badgeSky = Color(0xFF0284C7); // sky-600 (진료 대기)
  static const Color badgeViolet = Color(0xFF7C3AED); // violet-600 (접수됐어요)
  static const Color badgeSlate = Color(0xFF64748B); // slate-500 (시간 지남)
  static const Color badgeOnColor = Colors.white; // 색 배지 위 글자
  static const List<Color> grays = [grayPending, grayDone];

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

  static ThemeData get theme => ThemeData(
        useMaterial3: true,
        textTheme: const TextTheme(
          bodyLarge: TextStyle(fontSize: 15), // patientApp.body
        ),
      );
}
