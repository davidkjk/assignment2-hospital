import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/connectivity.dart';
import '../../core/theme.dart'; // AppTheme.brandFontFamily(워드마크 서체)
import '../../core/tokens.dart';
import '../notifications/notification_data.dart'; // unreadNotificationCountProvider 본체(T18)
import '../../widgets/action_button.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/pending_request_card.dart';
import 'appointment_card.dart';
import 'appointment_view.dart';
import 'home_data.dart';
import 'home_realtime.dart';
import 'home_scope.dart';
import 'hospital_info_row.dart';
import 'notification_bell.dart';

/// 로그인 후 첫 화면(HOME-ROLE-01). 데모 정본: 딥틸 브랜드 앱바 + 「오늘의 예약」 + 가장 가까운 하루치를
/// 풀 카드로 세로 스택(HOME-SCOPE-*·HOME-CARD). 셸·오프라인·빈 상태·유언은 T11·12 소비.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncAppts = ref.watch(homeAppointmentsProvider);
    final unread = ref.watch(unreadNotificationCountProvider);
    final hospital = ref.watch(hospitalInfoProvider).valueOrNull;

    return Scaffold(
      backgroundColor: const Color(0xFFEFF3F4),
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _BrandBar(
              unread: unread,
              onBell: () async {
                await ref.read(notificationReadMarkerProvider).markAllRead(); // NAV-HOME-12
                if (context.mounted) context.go('/notifications');
              },
              onSettings: () => context.go('/settings'), // NAV-HOME-13
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async => ref.invalidate(homeAppointmentsProvider), // HOME-REFRESH-01
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    PendingRequestCard(onConfirm: () => context.go('/my')), // HOME-KILL-01·02
                    ...asyncAppts.when(
                      loading: () => const [
                        Padding(
                            padding: EdgeInsets.all(24),
                            child: Center(child: CircularProgressIndicator())),
                      ],
                      error: (_, __) => [
                        EmptyState.error(onRetry: () => ref.invalidate(homeAppointmentsProvider)),
                      ],
                      data: (list) => _content(context, ref, list, hospital),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _content(
      BuildContext context, WidgetRef ref, List<AppointmentView>? list, HospitalInfo? hospital) {
    if (list == null) {
      // 오프라인 + 보관본 없음(OFF-DO-01/HOME-EMPTY-03).
      return [
        EmptyState.offline(
            screenName: '홈', onRetry: () => ref.invalidate(homeAppointmentsProvider)),
      ];
    }

    final day = selectHomeDay(list, DateTime.now());

    // HOME-REFRESH-02: 살아있는 카드가 있으면 실시간 구독을 연다(끝난 카드만이면 열지 않는다).
    final liveIds = day.where((a) => liveStatuses.contains(a.status)).map((a) => a.id).toList();
    final realtime = ref.read(homeRealtimeProvider);
    if (liveIds.isNotEmpty) {
      realtime.subscribe(liveIds);
    } else {
      realtime.unsubscribe();
    }

    if (day.isEmpty) {
      // HOME-EMPTY-01·02: 0건 안내 + [진료 예약하기] + 지난 방문 이력 보기(최근 방문 목록은 넣지 않는다).
      return [
        const SizedBox(height: 48),
        EmptyState.zero(
          message: '예정된 예약이 없습니다',
          nextAction: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ActionButton(
                  label: '진료 예약하기',
                  busyLabel: '여는 중…',
                  icon: Icons.calendar_month, // 데모 홈 빈 상태: <CalendarPlus/> 진료 예약하기
                  onPressed: () => context.go('/booking')), // NAV-HOME-14
              const SizedBox(height: 8),
              TextButton(
                  onPressed: () => context.go('/history'),
                  child: const Text('지난 방문 이력 보기')), // NAV-HOME-08
            ],
          ),
        ),
      ];
    }

    return [
      // 데모 정본: 「오늘의 예약」 + 「전체 예약 보기 ›」.
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('오늘의 예약',
                style: TextStyle(fontWeight: FontWeight.w600, color: AppTokens.grayPending)),
            TextButton(
                onPressed: () => context.go('/my'),
                child: const Text('전체 예약 보기 ›',
                    style: TextStyle(color: AppTokens.grayPending))),
          ],
        ),
      ),
      // 하루치를 풀 카드로 세로 스택(HOME-CARD — 데모 정본, 사람별 압축 줄 아님).
      for (final v in day)
        Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: InkWell(
            onTap: () => context.go('/appointments/${v.id}'), // NAV-HOME-01
            child: _HomeCard(view: v, onAcknowledge: () => _acknowledge(ref, v.id)), // NAV-HOME-15
          ),
        ),
      // HOME-INFO-01·02: 조회 성공 시만 병원 주소·전화(실패면 이 줄만 사라진다).
      if (hospital != null && !hospital.isEmpty)
        HospitalInfoRow(address: hospital.address ?? '', phone: hospital.phone ?? ''),
    ];
  }

  Future<void> _acknowledge(WidgetRef ref, String id) async {
    // 화면을 옮기지 않고 서버 두 칸을 비운 뒤 목록만 새로고침(NAV-HOME-15·CARD-CHG-04).
    try {
      await ref.read(homeAcknowledgeProvider)(id);
    } catch (_) {
      // 실패해도 화면은 그대로 — 다음 새로고침에서 다시 보인다.
    }
    ref.invalidate(homeAppointmentsProvider);
  }
}

/// 홈 카드 한 장 — 대기 상태면 예약별 큐를 읽어 「내 앞 N명」을 채우고, 오프라인 여부를 카드에 전한다.
class _HomeCard extends ConsumerWidget {
  const _HomeCard({required this.view, required this.onAcknowledge});
  final AppointmentView view;
  final VoidCallback onAcknowledge;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final online = ref.watch(connectivityProvider).valueOrNull ?? true;
    final state = resolveCardState(view, DateTime.now());
    // 대기 카드만 큐를 부른다(다른 상태는 불필요한 요청을 만들지 않는다).
    final queue = (online && state == AppointmentCardState.wait)
        ? ref.watch(queueStatusProvider(view.id)).valueOrNull
        : null;
    return AppointmentCard(
        view: view, queue: queue, online: online, onAcknowledge: onAcknowledge);
  }
}

/// 딥틸 브랜드 앱바(데모 정본): 가온병원 워드마크 + 종(알림함) + 톱니(설정). 흰 아이콘·글자.
class _BrandBar extends StatelessWidget {
  const _BrandBar({required this.unread, required this.onBell, required this.onSettings});
  final int unread;
  final VoidCallback onBell;
  final VoidCallback onSettings;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppTokens.primary,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: IconTheme(
        data: const IconThemeData(color: Colors.white),
        child: Row(
          children: [
            const Icon(Icons.local_hospital_outlined, size: 20),
            const SizedBox(width: 8),
            const Text('가온병원',
                style: TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontFamily: AppTheme.brandFontFamily, // 데모 .brand-wordmark(Do Hyeon)
                    fontWeight: FontWeight.w400, // 단일 가중치 디스플레이 서체
                    letterSpacing: 0.2)),
            const Spacer(),
            NotificationBell(unreadCount: unread, onTap: onBell),
            IconButton(icon: const Icon(Icons.settings), onPressed: onSettings), // NAV-HOME-13
          ],
        ),
      ),
    );
  }
}
