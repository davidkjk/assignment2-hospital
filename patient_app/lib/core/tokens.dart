import 'package:flutter/material.dart';

// 생성된 파일 — 편집하지 않는다. design-tokens/tokens.json에서 생성됨(build.mjs buildDart).
// 화면 코드는 색·크기·카드 규격을 여기서만 가져온다(하드코딩 금지).
class AppTokens {
  AppTokens._();

  // DISP-GRAY-01/02/03 — 회색은 두 진하기뿐. 새 색을 만들지 않는다.
  static const Color grayPending = Color(0xFF7E8E99); // patientApp.grayPending (아직 안 된 일)
  static const Color grayDone = Color(0xFFA3AFB8); // color.gray-past (이미 끝난 일)
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
