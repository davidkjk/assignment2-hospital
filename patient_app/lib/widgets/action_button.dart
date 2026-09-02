import 'package:flutter/material.dart';
import '../core/tokens.dart';

/// 서버에 무언가를 남기거나 바꾸는 버튼(BTN-SCOPE-01). 조회·화면 이동·펼치기 등 읽기만 하는
/// 동작(BTN-SCOPE-02)은 이 위젯을 쓰지 않는다 — 상태(busy)가 필요 없는 일반 버튼을 쓴다.
///
/// 상태별 모양:
/// - 평소: 진한 딥틸 + 흰 글자(BTN-STATE-01)
/// - 처리 중: 흐린 딥틸 + 흰 글자, 라벨은 진행형으로 유지(BTN-BUSY-01·BTN-STATE-02) — 회색으로 칠하지 않는다
/// - 비활성: 회색 + 회색 글자 + 이유 문구(BTN-STATE-03)
///
/// BTN-TIME-01: 앱은 스스로 시간제한을 걸지 않는다. busy는 오직 호출자(화면 Notifier)가
/// 서버 응답을 받아 false로 되돌릴 때만 풀린다. 처리 중 다시 눌러도 무시한다(BTN-BUSY-02).
class ActionButton extends StatelessWidget {
  final String label;           // 평소 라벨
  final String busyLabel;       // 처리 중 진행형 라벨(required — 상태 있는 버튼임을 타입으로 강제)
  final bool busy;              // 서버 응답 대기 중
  final String? disabledReason; // null이 아니면 비활성 + 이 이유 문구 노출(BTN-STATE-03)
  final VoidCallback onPressed;
  /// 크기 등급(AppButtonSize.cta 등). null이면 테마 기본(base). 색은 상태가 정하므로 여기서 덮지 않는다.
  final ButtonStyle? style;

  const ActionButton({
    super.key,
    required this.label,
    required this.busyLabel,
    required this.onPressed,
    this.busy = false,
    this.disabledReason,
    this.style,
  });

  bool get _disabled => disabledReason != null;

  @override
  Widget build(BuildContext context) {
    final Color bg = _disabled
        ? AppTokens.grayDone
        : (busy ? AppTokens.primaryBusy : AppTokens.primary);
    final Color fg = _disabled ? AppTokens.grayPending : Colors.white;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: bg,
            foregroundColor: fg,
          ).merge(style),
          // 버튼은 enabled로 두어 위 배경색을 유지하고(회색·흐린 딥틸을 Material 기본 disabled 스타일에
          // 뺏기지 않게), busy/비활성일 때 콜백만 내부에서 무시한다(BTN-BUSY-02·BTN-STATE-03·BTN-TIME-01).
          onPressed: () {
            if (busy || _disabled) return;
            onPressed();
          },
          child: Text(busy ? busyLabel : label),
        ),
        if (_disabled)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              disabledReason!,
              style: const TextStyle(color: AppTokens.grayPending, fontSize: 13),
            ),
          ),
      ],
    );
  }
}
