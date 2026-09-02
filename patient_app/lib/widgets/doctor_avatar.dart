import 'package:flutter/material.dart';
import '../core/tokens.dart';

/// BOOK-DOC-02·05 — 담당의사 아바타. 사진이 있으면 사진, 없으면 **회색 원 + 이름 첫 글자**.
/// (빈 네모나 '사진 없음' 문구를 쓰지 않는다.) 의사선택·예약상세·최종확인이 같은 위젯을 쓴다.
class DoctorAvatar extends StatelessWidget {
  const DoctorAvatar({super.key, required this.name, this.photoUrl, this.radius = 28});

  final String name;
  final String? photoUrl;
  final double radius;

  @override
  Widget build(BuildContext context) {
    if (photoUrl != null && photoUrl!.isNotEmpty) {
      return CircleAvatar(
        radius: radius,
        backgroundColor: AppTokens.border, // 로드 전/실패 시 회색 원(BOOK-DOC-05 재사용)
        backgroundImage: NetworkImage(photoUrl!), // BOOK-DOC-02
        onBackgroundImageError: (_, __) {},
      );
    }
    return CircleAvatar(
      radius: radius,
      backgroundColor: AppTokens.grayPending, // BOOK-DOC-05 — 회색 원(흰 글자 대비 위해 진한 쪽)
      child: Text(
        name.characters.first,
        style: TextStyle(fontSize: radius * 0.7, color: Colors.white),
      ),
    );
  }
}
