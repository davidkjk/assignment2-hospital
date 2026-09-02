import 'package:flutter/material.dart';
import '../core/tokens.dart';

/// 데모 확인 모달 껍데기 — Material 기본 AlertDialog 대신 데모의 커스텀 카드로 통일한다.
/// 데모: `rounded-2xl border bg-card p-5 shadow-xl`(둥근 18 카드 + 옅은 테두리 + 사방 20 + 강한 그림자).
/// 변경확인·취소확인·마감안내 세 대화상자가 같은 껍데기를 쓴다(파리티 + 일관).
class AppDialogCard extends StatelessWidget {
  const AppDialogCard({super.key, required this.child, this.alignment});
  final Widget child;

  /// 카드를 화면 어디에 놓을지(선택). 기본(null)은 중앙 — 취소·마감안내가 그대로 쓴다.
  /// 변경 확인창만 데모가 하단 정렬(items-end)이라 `Alignment.bottomCenter`를 넘긴다.
  final AlignmentGeometry? alignment;

  @override
  Widget build(BuildContext context) {
    return Dialog(
      alignment: alignment,
      backgroundColor: AppTokens.surface,
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
      elevation: 12, // 데모 shadow-xl 근사
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18), // rounded-2xl
        side: const BorderSide(color: AppTokens.border), // 데모 border
      ),
      child: Padding(
        padding: const EdgeInsets.all(20), // p-5
        child: child,
      ),
    );
  }
}

/// 데모 모달 머리 아이콘 — 동그란 옅은 배경 안의 아이콘(`rounded-full bg-… p-2`).
class AppDialogIcon extends StatelessWidget {
  const AppDialogIcon(this.icon, {super.key, required this.background, required this.color});
  final IconData icon;
  final Color background;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(8), // p-2
      decoration: BoxDecoration(color: background, shape: BoxShape.circle),
      child: Icon(icon, size: 20, color: color),
    );
  }
}
