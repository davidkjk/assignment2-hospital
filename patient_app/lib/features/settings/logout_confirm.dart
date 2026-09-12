import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers.dart';
import '../../core/push.dart';
import '../auth/auth_repo.dart';

// 로그아웃·탈퇴가 부르는 기기토큰 해제 창구(seam) — 테스트가 Firebase 없이 override한다.
final pushServiceProvider = Provider<PushService>((ref) => PushService(ref.watch(apiClientProvider)));

/// [SET-OUT-*] 로그아웃 — 평범한 버튼 → 안심시키는 확인 팝업 → 실행. 되돌릴 수 있는 동작이라
/// 탈퇴와 무게가 같아 보이면 안 된다(붉은색 아님). 팝업은 겁주는 게 아니라 예약이 사라진다는 오해를 푼다.
Future<void> showLogoutConfirm(BuildContext context, WidgetRef ref) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('로그아웃하시겠어요?'),
      content: const Text('로그아웃해도 예약 내용은 그대로 남아 있습니다. 다시 로그인하시면 이어서 보실 수 있어요.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('그대로 둘게요')),
        TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('로그아웃')), // 평범한 색
      ],
    ),
  );
  if (ok != true || !context.mounted) return;
  // [SET-OUT-08·09] 기기토큰 해제 — 실패해도 로그아웃 자체는 붙잡지 않는다.
  try {
    await ref.read(pushServiceProvider).unregisterToken();
  } catch (_) {/* SET-OUT-09 무시 */}
  await ref.read(authRepoProvider).signOut(); // [SET-OUT-07] 세션 + 예약 보관본 삭제(오프라인 무관 SET-OUT-12)
  if (context.mounted) context.go('/login'); // [SET-OUT-11] 로그인 화면으로(뒤로 못 감) — 이 앱엔 /landing이 없다
}
