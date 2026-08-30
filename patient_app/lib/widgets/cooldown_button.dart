import 'dart:async';
import 'package:flutter/material.dart';
import '../core/tokens.dart';
import '../core/phone_cooldown.dart';

/// 「다시 누르는 것이 정상 동작」인 버튼(BTN-COOL-01: 인증번호 다시 받기·새로고침·조회 실패의 [다시 시도]).
/// 누른 뒤 `[ N초 후 다시 받기 ]`로 바뀌어 1초씩 줄어들고(BTN-COOL-02·08), 0이 되면 원래대로 돌아온다.
/// 쿨다운은 번호 기준으로 Store가 관리하고, 화면 카운트다운은 그것을 1초마다 그린다(BTN-COOL-10).
class CooldownButton extends StatefulWidget {
  final String phone;
  final String label;
  final PhoneCooldownStore store;

  /// 실제 발송. 서버가 거절하며 남은 초를 주면 그 값을, 정상 발송이면 null을 돌려준다(BTN-COOL-06·10).
  final Future<int?> Function() onSend;

  const CooldownButton({
    super.key,
    required this.phone,
    required this.label,
    required this.store,
    required this.onSend,
  });

  @override
  State<CooldownButton> createState() => _CooldownButtonState();
}

class _CooldownButtonState extends State<CooldownButton> {
  Timer? _timer;
  int _remaining = 0;

  @override
  void initState() {
    super.initState();
    _refresh();
    _ensureTicking();
  }

  void _refresh() => _remaining = widget.store.remainingSeconds(widget.phone, DateTime.now());

  void _ensureTicking() {
    _timer?.cancel();
    if (_remaining > 0) {
      _timer = Timer.periodic(const Duration(seconds: 1), (tm) {
        setState(_refresh);
        if (_remaining <= 0) tm.cancel(); // 시간만 본다(BTN-COOL-03)
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _press() async {
    if (_remaining > 0) return; // 쿨다운 중엔 무시(막다른 길 아님 — 시간이 열어준다)
    final serverRemaining = await widget.onSend();
    if (serverRemaining != null) {
      await widget.store.syncFromServer(widget.phone, serverRemaining, DateTime.now());
    } else {
      await widget.store.start(widget.phone, DateTime.now()); // BTN-COOL-01·04
    }
    if (!mounted) return;
    setState(_refresh);
    _ensureTicking();
  }

  @override
  Widget build(BuildContext context) {
    final onCooldown = _remaining > 0;
    return FilledButton(
      style: FilledButton.styleFrom(
        backgroundColor: onCooldown ? AppTokens.grayDone : AppTokens.primary,
        foregroundColor: onCooldown ? AppTokens.grayPending : Colors.white,
      ),
      onPressed: () {
        if (!onCooldown) _press();
      },
      child: Text(onCooldown ? '$_remaining초 후 다시 받기' : widget.label),
    );
  }
}
