import 'package:flutter/material.dart';
import '../core/tokens.dart';

/// DISP-WARN-01 — 오프라인 띠를 제외한 모든 주의 표시. 배경 없이 글자 + 좌측 4px 바.
/// [icon]은 선택 — 홈 「확인 중」 배너처럼 결정 317(주의색 + 좌측 4px 바 + 시계)을 완전히
/// 지키는 곳에서만 시계 등을 함께 그린다. 가족 경고 등 범용 용처는 아이콘 없이 그대로 렌더된다.
class WarnText extends StatelessWidget {
  const WarnText(this.text, {super.key, this.icon});
  final String text;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final textWidget = Text(text, style: const TextStyle(color: AppTokens.warn));
    return Container(
      key: const Key('warn_box'),
      decoration: const BoxDecoration(
        border: Border(left: BorderSide(color: AppTokens.warn, width: AppTokens.warnBarWidth)),
      ),
      padding: const EdgeInsets.only(left: 8),
      child: icon == null
          ? textWidget
          // 상세 배너와 같은 치수(access_time_filled 16 + gap 6)로 통일한다.
          : Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, size: 16, color: AppTokens.warn),
                const SizedBox(width: 6),
                Expanded(child: textWidget),
              ],
            ),
    );
  }
}
