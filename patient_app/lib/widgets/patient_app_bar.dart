import 'package:flutter/material.dart';

/// 데모 ScreenHeader(딥틸 밴드·흰 글자·아이콘 인라인)를 그대로 옮긴 공통 앱바.
/// 밴드 색·글자색·높이는 이미 [AppBarTheme]가 잡으므로 여기선 「아이콘 + 타이틀」 배치만 한다.
///
/// - 최상위 탭 화면(나의 예약·가족·이력·AI 상담)은 [icon]을 줘 타이틀 왼쪽에 아이콘을 붙인다(데모와 동일).
/// - 2차 화면(설정·상세 등)은 [icon] 없이 뒤로 버튼 + 타이틀만(현행 그대로).
///
/// 아이콘은 Material 벡터(IconData)만 — 이모지 금지. 하단 탭바 아이콘과 짝을 맞춘다.
class PatientAppBar extends AppBar {
  PatientAppBar({
    super.key,
    required String title,
    IconData? icon,
    super.actions,
    super.leading,
    super.automaticallyImplyLeading,
  }) : super(
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
