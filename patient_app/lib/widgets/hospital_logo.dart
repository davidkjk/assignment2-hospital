import 'package:flutter/widgets.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// 병원 브랜드 로고 = 데모·직원웹과 같은 **Phosphor Hospital(채움)** 심볼(건물+십자).
/// Material `local_hospital`(십자 배지)는 데모와 글리프가 달라 SVG 벡터로 정확히 맞춘다.
/// (DISP-ICON-03 · 데모 Home/Login/Settings·직원웹 StaffShell이 모두 이 심볼)
class HospitalLogo extends StatelessWidget {
  const HospitalLogo({super.key, required this.size, this.color});

  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? DefaultTextStyle.of(context).style.color ?? const Color(0xFFFFFFFF);
    return SvgPicture.asset(
      'assets/icons/hospital_fill.svg',
      width: size,
      height: size,
      colorFilter: ColorFilter.mode(c, BlendMode.srcIn),
    );
  }
}
