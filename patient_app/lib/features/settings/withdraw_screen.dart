import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/connectivity.dart';
import '../../core/tokens.dart';
import '../../widgets/empty_state.dart';
import 'logout_confirm.dart' show pushServiceProvider;
import 'withdraw_repository.dart';

/// [SET-QUIT-*] 회원 탈퇴 — 되돌릴 수 없는 동작이라 무게를 3단으로 나눈다(화면 붉은 테두리 → 확인창 채운 빨강).
/// 진입 시 재인증을 이미 통과했다(민감 경로 가드) → 비밀번호를 다시 묻지 않는다.
class WithdrawScreen extends ConsumerStatefulWidget {
  const WithdrawScreen({super.key});

  @override
  ConsumerState<WithdrawScreen> createState() => _WithdrawScreenState();
}

class _WithdrawScreenState extends ConsumerState<WithdrawScreen> {
  bool _processing = false;

  static const _notices = [
    '탈퇴하셔도 진료기록은 의료법으로 정해진 기간 동안 병원에 안전하게 보관됩니다.', // SET-QUIT-04·05
    '탈퇴하시면 예약·가족·사전문진을 더 이상 볼 수 없습니다.',                       // SET-QUIT-06
    '연결된 가족 연결이 모두 해제됩니다.',                                            // SET-QUIT-07
    '같은 휴대폰 번호로 다시 가입하실 수 있습니다.',                                  // SET-QUIT-08
  ];

  Future<void> _confirmAndWithdraw() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('정말 탈퇴하시겠어요?'),
        content: const Text('탈퇴하시면 계정으로 다시 로그인할 수 없습니다.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('아니요')), // NAV-SET-13
          ElevatedButton(
            key: const Key('withdraw-final'),
            style: ElevatedButton.styleFrom(
                backgroundColor: AppTokens.warn, foregroundColor: Colors.white), // SET-QUIT-20 채운 빨강
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('탈퇴합니다'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _processing = true); // SET-QUIT-21 탈퇴 처리 중…
    try {
      try {
        await ref.read(pushServiceProvider).unregisterToken(); // SET-QUIT-23
      } catch (_) {/* 붙잡지 않는다 */}
      await ref.read(withdrawRepositoryProvider).deactivate();
      if (mounted) context.go('/login'); // SET-QUIT-26·NAV-SET-12 (이 앱엔 /landing 없음)
    } catch (_) {
      if (mounted) setState(() => _processing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final blocksAsync = ref.watch(withdrawBlocksProvider);
    final offline = ref.watch(connectivityProvider).valueOrNull == false;

    return Scaffold(
      appBar: AppBar(title: const Text('회원 탈퇴')),
      body: blocksAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => offline
            ? EmptyState.offline(
                screenName: '회원 탈퇴', onRetry: () => ref.invalidate(withdrawBlocksProvider))
            : EmptyState.error(onRetry: () => ref.invalidate(withdrawBlocksProvider)),
        data: (blocks) => _body(blocks, offline),
      ),
    );
  }

  Widget _body(List<WithdrawBlock> blocks, bool offline) {
    final blocked = blocks.isNotEmpty;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        // 고지 4줄(SET-QUIT-04·06·07·08).
        Container(
          decoration: BoxDecoration(
            color: AppTokens.surface,
            boxShadow: AppTokens.cardElevation,
            borderRadius: BorderRadius.circular(12),
          ),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('탈퇴 전에 확인해 주세요',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              for (final n in _notices)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text('· $n', style: const TextStyle(fontSize: 14, height: 1.5)),
                ),
            ],
          ),
        ),
        const SizedBox(height: 20),

        if (blocked) ...[
          // SET-QUIT-15·17·18 — 막는 예약 목록 + 비활성 버튼(사라지지 않음).
          const Text('먼저 예약을 취소해 주세요',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTokens.warn)),
          const SizedBox(height: 8),
          for (final b in blocks)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Text(
                b.isFamily
                    ? '${b.patientName} · ${b.department} ${b.slotDate} ${b.startTime}'   // 가족이면 이름
                    : '${b.department} ${b.slotDate} ${b.startTime}',
                style: const TextStyle(fontSize: 14),
              ),
            ),
          const SizedBox(height: 8),
          // SET-QUIT-16 — 왜 어떤 예약은 안 뜨는지.
          const Text('직접 앱을 쓰시는 가족의 예약은 여기 나오지 않으며, 그대로 유지됩니다.',
              style: TextStyle(fontSize: 13, color: AppTokens.grayPending)),
          const SizedBox(height: 16),
          OutlinedButton(
            key: const Key('go-appointments'),
            onPressed: () => context.push('/my'), // NAV-SET-11
            child: const Text('예약 보러 가기'),
          ),
          const SizedBox(height: 12),
          const _ProceedButton(
              disabledReason: '예약을 취소한 뒤 탈퇴할 수 있어요', onPressed: null), // SET-QUIT-17·18 회색으로 남음
        ] else ...[
          _ProceedButton(
            // SET-QUIT-27 — 오프라인이면 되돌릴 수 없어 막는다.
            disabledReason: offline ? '인터넷에 연결된 뒤에 탈퇴할 수 있습니다' : null,
            onPressed: offline || _processing ? null : _confirmAndWithdraw,
            processing: _processing,
          ),
        ],
      ],
    );
  }
}

/// SET-QUIT-03 — 화면의 탈퇴 버튼: 붉은 테두리(채움 아님). 비활성이면 회색 + 이유.
class _ProceedButton extends StatelessWidget {
  const _ProceedButton({this.onPressed, this.disabledReason, this.processing = false});
  final VoidCallback? onPressed;
  final String? disabledReason;
  final bool processing;

  @override
  Widget build(BuildContext context) {
    final disabled = onPressed == null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        OutlinedButton(
          key: const Key('withdraw-proceed'),
          onPressed: onPressed,
          style: OutlinedButton.styleFrom(
            foregroundColor: disabled ? AppTokens.grayPending : AppTokens.warn,
            side: BorderSide(color: disabled ? AppTokens.border : AppTokens.warn),
          ),
          child: Text(processing ? '탈퇴 처리 중…' : '회원 탈퇴'),
        ),
        if (disabledReason != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(disabledReason!,
                style: const TextStyle(fontSize: 13, color: AppTokens.grayPending)),
          ),
      ],
    );
  }
}
