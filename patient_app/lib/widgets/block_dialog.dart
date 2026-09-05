import 'package:flutter/material.dart';
import '../core/tokens.dart';

/// 막힘·확인 팝업. 어떤 경우에도 **빠져나갈 문([닫기])을 둔다**(BLOCK-EXIT-01 — 막다른 길 금지).
///
/// - `confirmLabel`을 주면 확인 버튼이 하나 더 생긴다. `destructive: true`면 그 버튼이 주의색이다
///   (BLOCK-CONF-01: 되돌릴 수 없는 동작의 빨간 버튼은 확인창 안에서만).
/// - `cancelLabel`을 주면 빠져나갈 문의 글자를 바꾼다(기본 `닫기`) — 예: 알림 끄기 안내의 `그대로 둘게요`.
/// - `before`/`after`를 주면 변경 전 → 후를 함께 보여준다(BLOCK-CHG-01).
/// - BLOCK-TIME-01: **소요 시간을 추정하는 문구(곧·보통)를 막는다** — 지킬 수 없는 약속이다.
Future<void> showBlockDialog(
  BuildContext context, {
  required String title,
  required String message,
  String? before,
  String? after,
  String? confirmLabel,
  String cancelLabel = '닫기',
  VoidCallback? onConfirm,
  bool destructive = false,
}) {
  assert(!_hasTimeEstimate(title) && !_hasTimeEstimate(message),
      'BLOCK-TIME-01: 소요 시간을 추정하지 않는다(`곧`·`보통` 등 금지) — 지킬 수 없는 약속');
  return showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(message),
          if (before != null && after != null) ...[
            const SizedBox(height: 12),
            Text('변경 전   $before'),
            Text('변경 후   $after'),
          ],
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: Text(cancelLabel)),
        if (confirmLabel != null)
          TextButton(
            style: destructive
                ? TextButton.styleFrom(foregroundColor: AppTokens.warn)
                : null,
            onPressed: () {
              Navigator.pop(ctx);
              onConfirm?.call();
            },
            child: Text(confirmLabel),
          ),
      ],
    ),
  );
}

bool _hasTimeEstimate(String s) => s.contains('곧') || s.contains('보통');

/// 처리 중 이탈 확인(BTN-EXIT-01). 앱이 시간을 재는 대신 사람이 판단하게 하는, `BTN-TIME-01`의
/// 탈출구다(BTN-EXIT-03). [나가기]면 true, [기다리기]·바깥 탭이면 false.
/// ⛔ BTN-EXIT-02: `나가시면 신청이 취소됩니다`를 쓰지 않는다 — 거짓말이고 중복 예약을 만든다.
Future<bool> showExitConfirm(BuildContext context) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('예약을 신청하는 중입니다'),
      content: const Text('나가셔도 신청은 계속 진행됩니다. 결과는 예약 목록에서 확인하실 수 있습니다.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('기다리기')),
        TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('나가기')),
      ],
    ),
  );
  return r ?? false;
}
