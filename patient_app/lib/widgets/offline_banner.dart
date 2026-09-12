import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/connectivity.dart';
import '../core/offline_cache.dart';
import '../core/session_guard.dart';
import '../core/tokens.dart';
import '../features/auth/auth_state.dart';

// OFF-BAN-01: 한 줄 고정 띠. OFF-BAN-02: 옅은 주황 배경(주의색 배경 금지의 예외 1건 — 전면 상태 배너 한정).
// OFF-BAN-03: 절대 시각('오후 3:12 기준'). OFF-BAN-04: 날짜 넘어가면 날짜를 앞에. OFF-BAN-06: 카드마다 꼬리표 안 단다(띠 하나뿐).
// OFF-AUTH-02: 만료가 겹치면 둘째 줄에 '연결되면 다시 로그인해 주세요'(팝업 안 띄운다).
class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final online = ref.watch(connectivityProvider).valueOrNull ?? true;
    final auth = ref.watch(effectiveAuthProvider);
    final expired = auth == AuthStatus.expiredOffline;
    if (online && !expired) return const SizedBox.shrink();            // OFF-BACK-01: 복구되면 조용히 사라진다

    final cachedAt = ref.watch(upcomingCacheProvider).valueOrNull?.savedAt;
    return Material(
      color: AppTokens.offlineBannerBg,                                // OFF-BAN-02: 옅은 주황
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('인터넷 연결 없음 · ${_asOf(cachedAt)} 기준 정보',   // OFF-BAN-01·03·04
                  style: const TextStyle(fontWeight: FontWeight.w600)),
              if (expired) const Text('연결되면 다시 로그인해 주세요'),  // OFF-AUTH-02
            ],
          ),
        ),
      ),
    );
  }

  static String _asOf(DateTime? t) {
    if (t == null) return '방금';
    final now = DateTime.now();
    final hh = t.hour < 12 ? '오전 ${t.hour == 0 ? 12 : t.hour}' : '오후 ${t.hour == 12 ? 12 : t.hour - 12}';
    final time = '$hh:${t.minute.toString().padLeft(2, '0')}';
    if (t.year == now.year && t.month == now.month && t.day == now.day) return time;   // OFF-BAN-03
    final y = now.subtract(const Duration(days: 1));
    if (t.year == y.year && t.month == y.month && t.day == y.day) return '어제 $time'; // OFF-BAN-04
    return '${t.month}월 ${t.day}일';                                                    // OFF-BAN-04
  }
}
