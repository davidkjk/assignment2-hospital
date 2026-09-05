import 'package:flutter/material.dart';
import '../core/env.dart';
import '../core/tokens.dart';

/// BOOK-DOC-02·05 — 담당의사 아바타. 사진이 있으면 사진, 없으면 **회색 원 + 이름 첫 글자**.
/// (빈 네모나 '사진 없음' 문구를 쓰지 않는다.) 의사선택·예약상세·최종확인이 같은 위젯을 쓴다.
class DoctorAvatar extends StatelessWidget {
  const DoctorAvatar({super.key, required this.name, this.photoUrl, this.radius = 28});

  final String name;
  final String? photoUrl;
  final double radius;

  /// photo_url이 상대경로(`/storage/...`)면 실행 환경의 Supabase 호스트를 이어붙인다.
  /// 데모 시드는 호스트를 안 박은 상대경로를 넣으므로(에뮬 10.0.2.2 / 로컬 127.0.0.1 대응),
  /// 여기서 Env.supabaseUrl로 해석한다. 관리자 업로드가 만든 절대 URL(http…)은 그대로 쓴다.
  String _resolve(String url) =>
      url.startsWith('/') ? '${Env.supabaseUrl}$url' : url;

  @override
  Widget build(BuildContext context) {
    if (photoUrl != null && photoUrl!.isNotEmpty) {
      // CircleAvatar.backgroundImage는 **정중앙 고정**이라 세로 인물 사진이면 얼굴(윗부분)이 잘린다.
      // 그래서 DecorationImage.alignment로 위를 당긴다 — Alignment(0,-0.55)=object-position 22.5%로
      // 데모(demo DoctorAvatar의 objectPosition '50% 22%')와 같은 프레이밍(BOOK-DOC-02).
      return Container(
        width: radius * 2,
        height: radius * 2,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: AppTokens.border, // 로드 전/실패 시 회색 원(BOOK-DOC-05 재사용)
          image: DecorationImage(
            image: NetworkImage(_resolve(photoUrl!)),
            fit: BoxFit.cover,
            alignment: const Alignment(0, -0.55),
            onError: (_, __) {},
          ),
        ),
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
