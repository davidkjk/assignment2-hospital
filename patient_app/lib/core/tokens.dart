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

  // DISP-CARD-01 — 카드 본문 높이 고정.
  static const double cardBodyHeight = 132.0;

  static ThemeData get theme => ThemeData(
        useMaterial3: true,
        textTheme: const TextTheme(
          bodyLarge: TextStyle(fontSize: 15), // patientApp.body
        ),
      );
}
