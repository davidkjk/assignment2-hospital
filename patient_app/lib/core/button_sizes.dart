import 'package:flutter/material.dart';
import 'theme.dart';
import 'tokens.dart';

/// 데모 Button `size` 변형(shadcn button.tsx)을 그대로 옮긴 크기 스타일.
/// 테마 기본은 base(h-8). 데모가 `size="lg"`·`className="h-12 text-base"` 등을 붙인 자리에만
/// 이 스타일을 `style:`로 얹는다 — 색·모서리는 테마가 그대로 이어받는다(ButtonStyle merge).
///
/// 손가락 영역: 시각 높이가 34px여도 Flutter 기본 tapTargetSize(padded)가 48px를 보장한다
/// (정본 「버튼·클릭 목표 44px」 충족). 대신 레이아웃 높이도 48이 되므로, 데모와 간격을 맞출 땐
/// 주변 여백에서 (48 - 시각 높이)/2 만큼을 뺀다.
class AppButtonSize {
  AppButtonSize._();

  static ButtonStyle _of(double height, double font) => ButtonStyle(
        minimumSize: WidgetStatePropertyAll(Size.fromHeight(height)),
        textStyle: WidgetStatePropertyAll(TextStyle(
            fontFamily: AppTheme.fontFamily, fontSize: font, fontWeight: AppTokens.buttonWeight)),
      );

  /// h-12 text-base — 전체폭 주요 행동(화면당 1개).
  static final ButtonStyle cta = _of(AppTokens.buttonCtaHeight, AppTokens.buttonCtaFont);

  /// h-11 text-sm.
  static final ButtonStyle tall = _of(AppTokens.buttonTallHeight, AppTokens.buttonTallFont);

  /// h-9 text-sm.
  static final ButtonStyle lg = _of(AppTokens.buttonLgHeight, AppTokens.buttonLgFont);

  /// h-8 text-sm — 테마 기본과 같다(명시용).
  static final ButtonStyle base = _of(AppTokens.buttonBaseHeight, AppTokens.buttonBaseFont);

  /// h-7 text-xs.
  static final ButtonStyle sm = _of(AppTokens.buttonSmHeight, AppTokens.buttonSmFont);

  /// Row·Wrap 안에서 폭을 내용만큼만(테마 기본 Size.fromHeight = 무한 minWidth를 끈다).
  static ButtonStyle shrink(ButtonStyle s) => s.copyWith(
        minimumSize: WidgetStatePropertyAll(Size(0, s.minimumSize!.resolve({})!.height)),
      );

  /// 시각 높이 h 버튼이 padded 탭 영역(48) 때문에 위아래로 더 차지하는 양(한쪽).
  static double tapPad(double h) => h >= 48 ? 0 : (48 - h) / 2;
}
