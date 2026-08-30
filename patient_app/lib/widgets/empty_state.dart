import 'package:flutter/material.dart';
import '../core/tokens.dart';

/// 오프라인·서버 오류·0건을 **한 벌의 모양**으로 처리한다(EMPTY-LAY-01):
/// 「아이콘 + 왜 비었는지 + (무엇을 하면 되는지) + 나가는 문 하나」. 하얀 빈 화면을 두지 않는다.
class EmptyState extends StatelessWidget {
  final IconData icon;
  final String message; // 설명 한 줄. 화면 이름을 넣는다(EMPTY-LAY-02).
  final String? hint;   // 둘째 줄
  final Widget? action; // 나가는 문/다음 행동. null이면 그리지 않는다(EMPTY-ZERO-02).

  const EmptyState({
    super.key,
    required this.icon,
    required this.message,
    this.hint,
    this.action,
  });

  /// EMPTY-OFF-01 — 오프라인. 조회 수단이 화면에 없으므로 [다시 시도]를 준다(ERR-RETRY-02).
  factory EmptyState.offline({required String screenName, required VoidCallback onRetry}) =>
      EmptyState(
        icon: Icons.wifi_off,
        message: '인터넷이 연결되어 있지 않습니다',
        hint: '연결되면 $screenName을 볼 수 있습니다', // EMPTY-LAY-02
        action: _RetryButton(onRetry),
      );

  /// EMPTY-ERR-01 — 서버 오류(조회 실패).
  factory EmptyState.error({required VoidCallback onRetry}) => EmptyState(
        icon: Icons.error_outline,
        message: '정보를 불러오지 못했습니다',
        hint: '잠시 후 다시 시도해주세요',
        action: _RetryButton(onRetry),
      );

  /// EMPTY-ZERO-01 — 목록이 실제로 비어 있음. 같은 문법 + 그 화면의 다음 행동(`nextAction`).
  /// EMPTY-ZERO-02 — 할 일이 없는 화면(알림함 등)은 `nextAction`을 주지 않는다 → 버튼도 [다시 시도]도 없다.
  factory EmptyState.zero({required String message, Widget? nextAction}) => EmptyState(
        icon: Icons.inbox_outlined,
        message: message,
        action: nextAction,
      );

  @override
  Widget build(BuildContext context) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: AppTokens.grayPending),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            if (hint != null) ...[
              const SizedBox(height: 4),
              Text(hint!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppTokens.grayPending)),
            ],
            if (action != null) ...[const SizedBox(height: 16), action!],
          ],
        ),
      );
}

class _RetryButton extends StatelessWidget {
  final VoidCallback onRetry;
  const _RetryButton(this.onRetry);
  @override
  Widget build(BuildContext context) =>
      OutlinedButton(onPressed: onRetry, child: const Text('다시 시도'));
}
