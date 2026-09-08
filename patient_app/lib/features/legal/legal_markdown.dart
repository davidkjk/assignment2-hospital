import 'package:flutter/material.dart';
import '../../core/tokens.dart';

/// 외부 패키지 없이 법률문서 마크다운 서브셋을 렌더한다(골든 결정성·배포 안정성).
/// 지원: #/##/### 제목 · **굵게** · `코드` · [텍스트](url) · > 인용 · - / 1. 목록 · | 표 |.
/// 글자확대(MediaQuery textScaler 자동)·스크린리더(기본 Text Semantics)를 그대로 탄다.
Widget buildLegalMarkdown(String source) {
  final blocks = <Widget>[];
  final lines = source.replaceAll('\r\n', '\n').split('\n');
  final table = <List<String>>[];

  void flushTable() {
    if (table.isEmpty) return;
    blocks.add(_table(List.of(table)));
    table.clear();
  }

  for (final raw in lines) {
    final t = raw.trim();
    // 표: |a|b| 형태를 모은다(구분행 |---| 은 버린다).
    if (t.startsWith('|') && t.endsWith('|') && t.length > 1) {
      final cells =
          t.substring(1, t.length - 1).split('|').map((c) => c.trim()).toList();
      final isDivider =
          cells.every((c) => c.isEmpty || RegExp(r'^:?-{1,}:?$').hasMatch(c));
      if (!isDivider) table.add(cells);
      continue;
    }
    flushTable();
    if (t.isEmpty) {
      blocks.add(const SizedBox(height: 8));
    } else if (t.startsWith('### ')) {
      blocks.add(_heading(t.substring(4), 15));
    } else if (t.startsWith('## ')) {
      blocks.add(_heading(t.substring(3), 17));
    } else if (t.startsWith('# ')) {
      blocks.add(_heading(t.substring(2), 20));
    } else if (t.startsWith('> ')) {
      blocks.add(_quote(t.substring(2)));
    } else if (t.startsWith('- ')) {
      blocks.add(_bullet('•', t.substring(2)));
    } else if (RegExp(r'^\d+\.\s').hasMatch(t)) {
      final m = RegExp(r'^(\d+)\.\s(.*)').firstMatch(t)!;
      blocks.add(_bullet('${m.group(1)}.', m.group(2)!));
    } else {
      blocks.add(Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: _inline(t, const TextStyle(fontSize: 14, height: 1.5)),
      ));
    }
  }
  flushTable();
  return Column(crossAxisAlignment: CrossAxisAlignment.start, children: blocks);
}

Widget _heading(String text, double size) => Padding(
      padding: const EdgeInsets.only(top: 12, bottom: 4),
      child: _inline(text, TextStyle(fontSize: size, fontWeight: FontWeight.bold)),
    );

Widget _quote(String text) => Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsets.fromLTRB(10, 6, 10, 6),
      decoration: const BoxDecoration(
        color: AppTokens.surface,
        border: Border(left: BorderSide(color: AppTokens.border, width: 3)),
      ),
      child: _inline(text, const TextStyle(fontSize: 13, color: AppTokens.grayPending)),
    );

Widget _bullet(String marker, String text) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 22, child: Text(marker, style: const TextStyle(fontSize: 14))),
        Expanded(child: _inline(text, const TextStyle(fontSize: 14, height: 1.5))),
      ]),
    );

Widget _table(List<List<String>> rows) => Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(border: Border.all(color: AppTokens.border)),
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++)
            IntrinsicHeight(
              child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final cell in rows[i])
                  Expanded(
                    child: Container(
                      decoration: BoxDecoration(
                          border: Border.all(color: AppTokens.border, width: 0.5)),
                      padding: const EdgeInsets.all(6),
                      child: _inline(
                          cell,
                          TextStyle(
                              fontSize: 12,
                              fontWeight:
                                  i == 0 ? FontWeight.bold : FontWeight.normal)),
                    ),
                  ),
              ],
            ),
            ),
        ],
      ),
    );

/// 인라인 마커를 TextSpan 조각으로 나눈다: **굵게**, `코드`, [텍스트](url).
Widget _inline(String text, TextStyle base) {
  final spans = <TextSpan>[];
  final re = RegExp(r'\*\*(.+?)\*\*|`(.+?)`|\[(.+?)\]\((.+?)\)');
  var idx = 0;
  for (final m in re.allMatches(text)) {
    if (m.start > idx) {
      spans.add(TextSpan(text: text.substring(idx, m.start), style: base));
    }
    if (m.group(1) != null) {
      spans.add(TextSpan(text: m.group(1), style: base.copyWith(fontWeight: FontWeight.bold)));
    } else if (m.group(2) != null) {
      spans.add(TextSpan(
          text: m.group(2),
          style: base.copyWith(fontFamily: 'monospace', color: AppTokens.primary)));
    } else {
      // 링크: 뷰어 맥락에선 텍스트만 강조(밑줄). 탭 동작은 이번 범위 밖.
      spans.add(TextSpan(
          text: m.group(3),
          style: base.copyWith(
              color: AppTokens.primary, decoration: TextDecoration.underline)));
    }
    idx = m.end;
  }
  if (idx < text.length) spans.add(TextSpan(text: text.substring(idx), style: base));
  return Text.rich(
      TextSpan(children: spans.isEmpty ? [TextSpan(text: text, style: base)] : spans));
}
