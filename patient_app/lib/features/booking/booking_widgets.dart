import 'package:flutter/material.dart';
import '../../core/tokens.dart';

// 데모 정본: 흰 카드(둥근 18 = rounded-2xl) + 3겹 딥틸 그림자(--elevation-card) + 눌림 잉크.
// 그림자는 AppTokens.cardElevation(데모 --elevation-card 그대로) — 단겹이 아니라 아래로 또렷이 떠 보인다.
class BookingSelectCard extends StatelessWidget {
  const BookingSelectCard(
      {super.key, required this.child, required this.onTap, this.padding});
  final Widget child;
  final VoidCallback onTap;
  final EdgeInsets? padding;
  @override
  Widget build(BuildContext context) {
    // 그림자는 바깥 Container에 그린다 — 안쪽(Ink/Material)에 두면 카드 사각형에 잘려
    // 부드럽게 못 퍼진다. Material은 투명 + 라운드 클립으로 눌림 잉크만 담당.
    return Container(
      decoration: BoxDecoration(
        color: AppTokens.surface,
        borderRadius: BorderRadius.circular(18),
        boxShadow: AppTokens.cardElevation, // 데모 --elevation-card (카드 밖으로 확산)
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(18),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap, // BOOK-DOC-01 — 줄(카드) 전체가 터치 영역
          child: Padding(
            padding: padding ?? const EdgeInsets.all(16),
            child: child,
          ),
        ),
      ),
    );
  }
}

// 스텝 제목 — 데모 text-xl font-bold.
class StepTitle extends StatelessWidget {
  const StepTitle(this.text, {super.key, this.subtitle});
  final String text;
  final String? subtitle;
  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(text, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
      if (subtitle != null)
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(subtitle!,
              style: const TextStyle(fontSize: 13, color: AppTokens.grayPending)), // BOOK-DOC-08 보조 라벨
        ),
    ]);
  }
}
