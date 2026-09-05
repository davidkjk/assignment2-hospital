import 'package:flutter/material.dart';

/// 데모 ScreenHeader(딥틸 밴드·흰 글자·아이콘 인라인)를 그대로 옮긴 공통 앱바.
/// 밴드 색·글자색·높이는 [AppBarTheme]가 잡으므로 여기선 「아이콘 + 타이틀」 배치와
/// 「뒤로 버튼–제목 간격」만 다룬다.
///
/// - 최상위 탭 화면(나의 예약·가족·이력)은 [icon]을 줘 타이틀 왼쪽에 아이콘을 붙인다(데모와 동일).
/// - 2차 화면(설정·상세 등)은 [icon] 없이 뒤로 버튼 + 타이틀만.
///
/// ⭐ 뒤로/닫기 버튼이 실제로 붙는 화면에서만 화살표와 제목을 데모처럼 촘촘히(gap-2, 8px) 붙인다.
///   Material 기본(leadingWidth 56 + titleSpacing 16)은 화살표와 제목이 ~34px 벌어져 보인다
///   (2026-09-03 사용자 전수조사 지적). 뒤로 버튼이 없는 최상위 탭·로그인은 기본 왼쪽 패딩
///   (titleSpacing 16)을 지켜 제목이 가장자리에 붙지 않게 둔다.
///
/// ⛔ 터치영역: leadingWidth는 48로 둔다(Android 최소 터치영역 48dp — 코드리뷰 #4, 2026-09-04).
///   높이는 toolbarHeight 48이라 이미 충족. 옛 44는 폭이 48dp 미만이라 되돌리지 말 것.
///   시각적 촘촘함은 leadingWidth 대신 titleSpacing 음수(-4)로 제목을 당겨 유지한다:
///   48폭 박스 안 아이콘 중심 24 → 아이콘 우측 36, 제목은 48-4=44에서 시작 → gap 정확히 8px(데모 gap-2).
///   히트영역만 48로 키우고 제목 절대위치(44)는 옛 44+0과 동일 — 시각 회귀 최소.
///
/// 아이콘은 벡터(IconData)만 — 이모지 금지. 하단 탭바 아이콘과 짝을 맞춘다.
class PatientAppBar extends StatelessWidget implements PreferredSizeWidget {
  const PatientAppBar({
    super.key,
    required this.title,
    this.icon,
    this.actions,
    this.leading,
    this.bottom,
    this.automaticallyImplyLeading = true,
  });

  final String title;
  final IconData? icon;
  final List<Widget>? actions;
  final Widget? leading;
  final PreferredSizeWidget? bottom;
  final bool automaticallyImplyLeading;

  @override
  Size get preferredSize =>
      Size.fromHeight(48 + (bottom?.preferredSize.height ?? 0)); // 테마 toolbarHeight 48 + bottom

  @override
  Widget build(BuildContext context) {
    final hasLeading =
        leading != null || (automaticallyImplyLeading && Navigator.of(context).canPop());
    return AppBar(
      leading: leading,
      automaticallyImplyLeading: automaticallyImplyLeading,
      actions: actions,
      bottom: bottom,
      leadingWidth: hasLeading ? 48 : null, // 기본 56 → 48 (Android 최소 터치영역 48dp, 코드리뷰 #4)
      titleSpacing: hasLeading ? -4 : null, // 제목을 44px로 당겨 데모 gap-2(8px) 유지(위 주석)
      title: icon == null
          ? Text(title)
          : Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 20),
                const SizedBox(width: 8),
                Text(title),
              ],
            ),
    );
  }
}
