import 'package:flutter/material.dart';
import 'tokens.dart';

/// 데모 디자인 시스템(teal 밴드·흰 카드 입력칸·둥근 딥틸 버튼·각진 체크)을 AppTokens 값으로 조립한다.
/// 색·크기 값은 모두 생성된 tokens.dart에서 가져온다(하드코딩 금지). 여기는 「조립」만 한다.
class AppTheme {
  AppTheme._();

  /// 본문·UI 전역 서체(데모 --font-sans). pubspec fonts 등록명과 일치.
  static const String fontFamily = 'Pretendard';

  /// 브랜드 워드마크 전용 서체(데모 .brand-wordmark). 로고·병원명에만 쓴다 — 본문엔 쓰지 않는다.
  static const String brandFontFamily = 'DoHyeon';

  static ThemeData get theme {
    const scheme = ColorScheme.light(
      primary: AppTokens.primary,
      onPrimary: Colors.white,
      surface: AppTokens.surface,
      onSurface: AppTokens.onSurface,
      error: AppTokens.warn,
      outline: AppTokens.border,
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      fontFamily: fontFamily, // 전역 Pretendard — 지정 안 하면 iOS 기본(SF Pro)이라 데모와 인상이 갈렸다.
      scaffoldBackgroundColor: AppTokens.background,
      textTheme: const TextTheme(
        bodyLarge: TextStyle(
            fontFamily: fontFamily, fontSize: AppTokens.bodyFontSize, color: AppTokens.onSurface),
      ),
      // 2차 화면 헤더 = 데모 ScreenHeader(딥틸 밴드·흰 글자·base medium·아래 그림자).
      // 데모 정본: text-base(17)·font-medium(볼드 아님)·탭바처럼 아래 그림자로 깊이감.
      appBarTheme: const AppBarTheme(
        backgroundColor: AppTokens.primary,
        foregroundColor: Colors.white,
        elevation: 3,
        scrolledUnderElevation: 3,
        shadowColor: Color(0x40102D32), // 딥틸 톤 드롭(데모 헤더 그림자)
        centerTitle: false,
        titleTextStyle: TextStyle(
            fontFamily: fontFamily, color: Colors.white, fontSize: 17, fontWeight: FontWeight.w500),
        iconTheme: IconThemeData(color: Colors.white),
      ),
      // 입력칸 = 흰 면 + 둥근 사각 테두리(데모: 라벨은 칸 위에 별도, 칸 안엔 안내글만).
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppTokens.surface,
        isDense: false,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        hintStyle: const TextStyle(color: AppTokens.grayPending),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppTokens.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppTokens.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppTokens.primary, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppTokens.warn),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppTokens.warn, width: 1.6),
        ),
      ),
      // 주 버튼 = 딥틸 채움·h48·둥근 사각·굵은 흰 글자. 비활성=흐린 딥틸(회색 아님).
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppTokens.primary,
          foregroundColor: Colors.white,
          disabledBackgroundColor: AppTokens.primaryBusy,
          disabledForegroundColor: Colors.white,
          minimumSize: const Size.fromHeight(48),
          textStyle: const TextStyle(fontFamily: fontFamily, fontSize: 17, fontWeight: FontWeight.bold),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
      ),
      // 보조 버튼 = 흰 면 + 테두리·진회색 글자.
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppTokens.onSurface,
          backgroundColor: AppTokens.surface,
          side: const BorderSide(color: AppTokens.border),
          minimumSize: const Size.fromHeight(48),
          textStyle: const TextStyle(fontFamily: fontFamily, fontSize: 17, fontWeight: FontWeight.bold),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
      ),
      // 텍스트 링크 버튼 = 딥틸·굵게(데모 하단 링크들).
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppTokens.primary,
          textStyle: const TextStyle(fontFamily: fontFamily, fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      // 체크박스 = 네모(데모: 각진 사각). 켜지면 딥틸.
      checkboxTheme: CheckboxThemeData(
        fillColor: WidgetStateProperty.resolveWith((s) =>
            s.contains(WidgetState.selected) ? AppTokens.primary : Colors.transparent),
        checkColor: WidgetStateProperty.all(Colors.white),
        side: const BorderSide(color: AppTokens.grayPending, width: 1.6),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
      ),
      dividerTheme: const DividerThemeData(color: AppTokens.border, thickness: 1, space: 1),
    );
  }
}
