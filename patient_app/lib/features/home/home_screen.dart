import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../widgets/action_button.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/pending_request_card.dart';
import 'appointment_card.dart';
import 'appointment_view.dart';
import 'home_data.dart';
import 'home_multi_card.dart';
import 'home_realtime.dart';
import 'home_scope.dart';
import 'hospital_info_row.dart';
import 'notification_bell.dart';

/// 로그인 후 첫 화면(HOME-ROLE-01). 「가장 가까운 하루치」만 보여주고(HOME-SCOPE-*), 종·톱니 앱바 +
/// 하단 탭(AppShell)로 앱 전체를 잇는다. 예약 카드 한 장은 T15, 셸·오프라인·빈 상태·유언은 T11·12 소비.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncAppts = ref.watch(homeAppointmentsProvider);
    final unread = ref.watch(unreadNotificationCountProvider);
    final hospital = ref.watch(hospitalInfoProvider).valueOrNull;

    return Scaffold(
      appBar: AppBar(
        title: const Text('홈'),
        actions: [
          // HOME-BAR-01·02 · NAV-HOME-12: 종 → 들어가는 순간 전부 읽음 + 알림함으로.
          NotificationBell(
            unreadCount: unread,
            onTap: () async {
              await ref.read(notificationReadMarkerProvider).markAllRead();
              if (context.mounted) context.go('/notifications');
            },
          ),
          // HOME-BAR-01 · NAV-HOME-13: 톱니 → 설정. (햄버거 없음)
          IconButton(
              icon: const Icon(Icons.settings), onPressed: () => context.go('/settings')),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(homeAppointmentsProvider), // HOME-REFRESH-01
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // HOME-KILL-01·02: 결과 못 받은 신청이 있으면 최상단(없으면 빈 위젯). 확인 → 나의 예약(T30).
            PendingRequestCard(onConfirm: () => context.go('/my')),
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
    );
  }

  List<Widget> _content(
      BuildContext context, WidgetRef ref, List<AppointmentView>? list, HospitalInfo? hospital) {
    // 오프라인 + 보관본 없음(OFF-DO-01/HOME-EMPTY-03) — "예약 없음" 거짓말 대신 오프라인 빈 상태.
    if (list == null) {
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
        EmptyState.zero(
          message: '예약된 진료가 없습니다',
          nextAction: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ActionButton(
                  label: '진료 예약하기',
                  busyLabel: '여는 중…',
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

    final Widget card = day.length == 1
        ? InkWell(
            onTap: () => context.go('/appointments/${day.first.id}'), // NAV-HOME-01
            child: AppointmentCard(
              view: day.first,
              onAcknowledge: () => _acknowledge(ref, day.first.id), // NAV-HOME-15
            ),
          )
        : HomeMultiCard(
            views: day,
            onRow: (v) => context.go('/appointments/${v.id}'), // NAV-HOME-01
            onQr: (v) => context.go('/qr/${v.id}'), // NAV-HOME-02
          );

    return [
      card,
      // HOME-INFO-01·02: 조회 성공 시만 카드 아래 주소·전화 두 줄(실패면 이 줄이 통째로 사라진다).
      if (hospital != null && !hospital.isEmpty) ...[
        const SizedBox(height: 16),
        HospitalInfoRow(
          address: hospital.address ?? '',
          phone: hospital.phone ?? '',
        ),
      ],
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
