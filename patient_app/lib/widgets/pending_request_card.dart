import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/pending_request.dart';

/// 앱이 죽은 뒤 다시 켰을 때 홈 맨 위에 뜨는 안내(BTN-KILL-03). 남은 유언이 없으면 아무것도
/// 그리지 않는다. `[예약 목록에서 확인]`을 누르면 유언을 지우고(BTN-KILL-05) `onConfirm`을
/// 부른다 — 이동 경로는 소비하는 화면(홈, Task 13+)이 넣는다.
///
/// ⛔ BTN-KILL-07: `[다시 신청]`을 두지 않는다. 멱등성이 없어 자동·수동 재신청은 예약을 두 건 만든다.
class PendingRequestCard extends ConsumerWidget {
  final VoidCallback onConfirm; // 보통 '/my'(나의 예약)로 이동
  const PendingRequestCard({super.key, required this.onConfirm});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pending = ref.watch(pendingRequestProvider).valueOrNull;
    if (pending == null) return const SizedBox.shrink();
    return Card(
      child: ListTile(
        title: Text(pending.homeMessage), // BTN-KILL-03·04: 적어둔 시각을 넣은 한 줄
        trailing: TextButton(
          onPressed: () async {
            await ref.read(pendingRequestStoreProvider).dismiss(); // BTN-KILL-05
            ref.invalidate(pendingRequestProvider);
            onConfirm();
          },
          child: const Text('예약 목록에서 확인'),
        ),
      ),
    );
  }
}
