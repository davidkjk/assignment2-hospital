import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// 골든 테스트가 **실제 배포 서체로** 렌더하도록 폰트를 로드한다.
///
/// 왜 실폰트인가: 첫 시뮬레이터 검수(2026-09-01)에서 「골든은 통과하는데 앱은 데모와
/// 인상이 다른」 폰트 갭이 드러났다. 원인은 골든이 AppleGothic만 로드해 실제 Pretendard·
/// Do Hyeon을 못 봤던 것. 배포 서체를 그대로 로드하면 이 사각지대가 닫히고, 골든이
/// 폰트로 인한 넘침·정렬 어긋남까지 잡는다.
///
/// 로드 목록:
/// - Pretendard(본문·UI 전역, `AppTheme.fontFamily`) — 정적 4종.
/// - Do Hyeon(브랜드 워드마크, `AppTheme.brandFontFamily`).
/// - Roboto = AppleGothic(Material 기본 계열이 남긴 한글 폴백).
/// - MaterialIcons(아이콘 tofu 방지).
Future<void> loadGoldenFonts() async {
  Future<void> load(String family, List<String> paths) async {
    final loader = FontLoader(family);
    var any = false;
    for (final p in paths) {
      final f = File(p);
      if (f.existsSync()) {
        loader.addFont(Future.value(f.readAsBytesSync().buffer.asByteData()));
        any = true;
      }
    }
    if (any) await loader.load();
  }

  // 배포 서체 — assets/fonts(패키지 루트 기준, 골든은 루트에서 실행).
  await load('Pretendard', const [
    'assets/fonts/Pretendard-Regular.otf',
    'assets/fonts/Pretendard-Medium.otf',
    'assets/fonts/Pretendard-SemiBold.otf',
    'assets/fonts/Pretendard-Bold.otf',
  ]);
  await load('DoHyeon', const ['assets/fonts/DoHyeon-Regular.ttf']);

  // 한글 폴백(Material 기본 'Roboto'로 남는 텍스트 대비) — 시스템 AppleGothic.
  await load('Roboto', const ['/System/Library/Fonts/Supplemental/AppleGothic.ttf']);

  // 아이콘.
  await load('MaterialIcons', const [
    '/Users/kimjunkee/dev/flutter/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
  ]);
}
