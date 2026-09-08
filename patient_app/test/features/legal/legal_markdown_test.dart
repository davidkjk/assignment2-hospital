import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/legal/legal_documents.dart';
import 'package:hospital_patient_app/features/legal/legal_markdown.dart';

Widget _host(Widget child) =>
    MaterialApp(home: Scaffold(body: SingleChildScrollView(child: child)));

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('실제 4개 문서를 오류 없이 렌더하고 마커가 남지 않는다', (t) async {
    for (final d in legalDocs.values) {
      final body = await rootBundle.loadString(d.assetPath);
      await t.pumpWidget(_host(buildLegalMarkdown(body)));
      // 렌더 예외 없음 + 미커버 마커 잔존 없음(제목 #/표 구분행/굵게·코드 마커).
      expect(find.textContaining('|---'), findsNothing, reason: '${d.key}: 표 구분행 잔존');
      expect(find.textContaining('**'), findsNothing, reason: '${d.key}: 굵게 마커 잔존');
    }
  });

  testWidgets('제목·단락·목록·인용을 텍스트로 렌더한다', (t) async {
    await t.pumpWidget(_host(buildLegalMarkdown(
        '# 제목1\n\n본문 단락\n\n- 첫 항목\n1. 번호 항목\n\n> 인용 줄')));
    expect(find.text('제목1'), findsOneWidget);
    expect(find.text('본문 단락'), findsOneWidget);
    expect(find.textContaining('첫 항목'), findsOneWidget);
    expect(find.textContaining('번호 항목'), findsOneWidget);
    expect(find.textContaining('인용 줄'), findsOneWidget);
  });

  testWidgets('표 구분행(|---|)은 렌더하지 않고 셀만 렌더한다', (t) async {
    await t.pumpWidget(_host(buildLegalMarkdown(
        '| 항목 | 값 |\n|---|---|\n| 대표전화 | 1588-7830 |')));
    expect(find.textContaining('대표전화'), findsOneWidget);
    expect(find.textContaining('1588-7830'), findsOneWidget);
    expect(find.textContaining('---'), findsNothing);
  });

  testWidgets('**굵게**와 `코드`의 마커는 본문에 남지 않는다', (t) async {
    await t.pumpWidget(_host(buildLegalMarkdown('**중요** 그리고 `terms_version` 값')));
    expect(find.textContaining('중요'), findsOneWidget);
    expect(find.textContaining('terms_version'), findsOneWidget);
    expect(find.textContaining('**'), findsNothing);
    expect(find.textContaining('`'), findsNothing);
  });
}
