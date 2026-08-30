import 'package:flutter/material.dart';
import '../../core/tokens.dart';

// 데모 정본: 흰 카드(둥근 16) + 옅은 그림자 + 눌림 잉크. 선택 목록의 한 줄.
class BookingSelectCard extends StatelessWidget {
  const BookingSelectCard(
      {super.key, required this.child, required this.onTap, this.padding});
  final Widget child;
  final VoidCallback onTap;
  final EdgeInsets? padding;
  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppTokens.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap, // BOOK-DOC-01 — 줄(카드) 전체가 터치 영역
        borderRadius: BorderRadius.circular(16),
        child: Ink(
          decoration: BoxDecoration(
            color: AppTokens.surface,
            borderRadius: BorderRadius.circular(16),
            boxShadow: const [
              BoxShadow(color: Color(0x24102D32), blurRadius: 8, offset: Offset(0, 1)),
            ],
          ),
          padding: padding ?? const EdgeInsets.all(16),
          child: child,
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
