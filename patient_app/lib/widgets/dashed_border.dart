import 'package:flutter/material.dart';

/// 점선 테두리 상자(패키지 없이 CustomPaint로 — 데모 `border-dashed` 대응).
/// 색·radius·배경을 받아 여러 곳에서 재사용한다(가족 추가·상담 진입점·상세 자리표시자).
class DottedBorder extends StatelessWidget {
  const DottedBorder({
    super.key,
    required this.child,
    this.color = const Color(0xFFC4CDD3),
    this.radius = 14,
    this.strokeWidth = 1.2,
    this.backgroundColor,
    this.padding,
  });

  final Widget child;
  final Color color;
  final double radius;
  final double strokeWidth;

  /// 점선 안쪽 연한 배경(예: 상담 진입점 딥틸 틴트). null이면 투명.
  final Color? backgroundColor;

  /// 점선 안쪽 여백. 배경 틴트를 점선과 같은 둥근 사각형으로 맞추려면 함께 준다.
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    Widget content = child;
    if (padding != null || backgroundColor != null) {
      content = Container(
        padding: padding,
        decoration: backgroundColor == null
            ? null
            : BoxDecoration(
                color: backgroundColor,
                borderRadius: BorderRadius.circular(radius),
              ),
        child: content,
      );
    }
    return CustomPaint(
      painter: _DashedRectPainter(
          color: color, radius: radius, strokeWidth: strokeWidth),
      child: SizedBox(width: double.infinity, child: content),
    );
  }
}

class _DashedRectPainter extends CustomPainter {
  const _DashedRectPainter(
      {required this.color, required this.radius, required this.strokeWidth});
  final Color color;
  final double radius;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = strokeWidth
      ..style = PaintingStyle.stroke;
    const dash = 5.0, gap = 4.0;
    final rrect = RRect.fromRectAndRadius(
        Offset.zero & size, Radius.circular(radius));
    final path = Path()..addRRect(rrect);
    for (final metric in path.computeMetrics()) {
      var dist = 0.0;
      while (dist < metric.length) {
        canvas.drawPath(metric.extractPath(dist, dist + dash), paint);
        dist += dash + gap;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DashedRectPainter old) =>
      old.color != color || old.radius != radius || old.strokeWidth != strokeWidth;
}
