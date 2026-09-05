import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/connectivity.dart';
import '../../core/tokens.dart';
import '../../core/wait_format.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/patient_app_bar.dart';
import 'notification_data.dart';
import 'notification_gone_dialog.dart';
import 'notification_view.dart';

/// 알림함(NOTI-*): 날짜 묶음 목록 + 왼쪽 색 바(안 읽음) + 30일 안내 + 빈/오프라인/오류 3종.
/// 진입 순간 「전부 읽음」(seen_at=now) — 단, 목록 조회가 끝난 뒤 불러 색 바를 이번 열람엔 남긴다.
class NotificationInbox extends ConsumerStatefulWidget {
  const NotificationInbox({super.key, this.now});
  final DateTime? now; // 골든 결정론용 시각 주입(없으면 DateTime.now()).

  @override
  ConsumerState<NotificationInbox> createState() => _NotificationInboxState();
}

class _NotificationInboxState extends ConsumerState<NotificationInbox> {
  bool _marked = false;

  void _maybeMarkRead() {
    if (_marked) return;
    _marked = true;
    // NOTI-READ-04: 목록 조회가 끝난 뒤(data 도착) 한 번. 배지 0, 색 바는 이번 열람엔 보존.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) markNotificationsRead(ref);
    });
  }

  @override
  Widget build(BuildContext context) {
    final online = ref.watch(connectivityProvider).valueOrNull ?? true;
    return Scaffold(
      backgroundColor: AppTokens.background,
      appBar: PatientAppBar(
        title: '알림함',
        leading: IconButton(
          icon: const Icon(AppIcons.arrow_back),
          onPressed: () => context.go('/home'),
        ),
        actions: const [
          Padding(padding: EdgeInsets.only(right: 16), child: Icon(AppIcons.notifications)),
        ],
      ),
      body: _body(online),
    );
  }

  Widget _body(bool online) {
    if (!online) {
      // NOTI-EMPTY-03·OFF-01·CACHE-01: 오프라인이면 캐시 없이 [다시 시도].
      return EmptyState.offline(
          screenName: '알림함', onRetry: () => ref.invalidate(notificationsProvider));
    }
    return ref.watch(notificationsProvider).when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, __) =>
              EmptyState.error(onRetry: () => ref.invalidate(notificationsProvider)),
          data: (items) {
            _maybeMarkRead();
            if (items.isEmpty) {
              // NOTI-EMPTY-01·02: 사실이므로 [다시 시도]를 두지 않는다(nextAction 없음).
              return const Center(
                child: EmptyState(
                  icon: AppIcons.notifications,
                  message: '받은 알림이 없습니다',
                  hint: '예약이 확정되거나 변경되면 여기에서 알려드립니다',
                ),
              );
            }
            return _list(items);
          },
        );
  }

  Widget _list(List<NotificationView> items) {
    final now = widget.now ?? DateTime.now();
    final sections = <Widget>[];
    String? group;
    var bucket = <NotificationView>[];
    void flush() {
      if (bucket.isEmpty) return;
      sections.add(_Section(
        label: group!,
        items: List.of(bucket),
        onTap: (v) => openNotification(context, ref, v),
      ));
      bucket = [];
    }

    for (final v in items) {
      final g = notificationDateGroup(v.sentAt, now);
      if (g != group) {
        flush();
        group = g;
      }
      bucket.add(v);
    }
    flush();

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
      children: [
        for (final s in sections) Padding(padding: const EdgeInsets.only(bottom: 24), child: s),
        const Text(
          '알림은 30일 동안 보관됩니다', // NOTI-KEEP-02
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12, color: AppTokens.grayPending),
        ),
      ],
    );
  }
}

/// 날짜 묶음 하나 — 회색 머리 + 흰 카드에 줄들을 divider로 쌓는다(데모 정본).
class _Section extends StatelessWidget {
  const _Section({required this.label, required this.items, required this.onTap});
  final String label;
  final List<NotificationView> items;
  final void Function(NotificationView) onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(label,
              style: const TextStyle(
                  fontSize: 13, fontWeight: FontWeight.w600, color: AppTokens.grayPending)),
        ),
        Container(
          clipBehavior: Clip.antiAlias,
          // 데모 알림 그룹 = overflow-hidden rounded-xl border bg-card(테두리, 그림자 없음).
          decoration: BoxDecoration(
            color: AppTokens.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppTokens.border),
          ),
          child: Column(
            children: [
              for (var i = 0; i < items.length; i++) ...[
                if (i > 0) const Divider(height: 1, thickness: 1, color: AppTokens.border),
                NotificationRow(view: items[i], onTap: () => onTap(items[i])),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// 알림 한 줄 — 왼쪽 4px 색 바(안 읽음) + 아이콘 + 제목 + 본문(그대로) + 시각.
class NotificationRow extends StatelessWidget {
  const NotificationRow({super.key, required this.view, required this.onTap});
  final NotificationView view;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final read = view.isRead;
    final important = notificationImportant(view.notificationType);
    // NOTI-READ-01: 안 읽음=색 바(중요=주의색/일반=딥틸), 읽음=투명(바 없음).
    final bar = read ? Colors.transparent : (important ? AppTokens.warn : AppTokens.primary);
    // NOTI-READ-02: 읽은 줄은 글자·아이콘이 회색으로 내려간다.
    final titleColor = read ? AppTokens.grayDone : AppTokens.onSurface;
    final iconColor = read ? AppTokens.grayDone : AppTokens.primary;
    final bodyColor = read ? AppTokens.grayDone : AppTokens.muted;

    return InkWell(
      onTap: onTap,
      child: Container(
        key: const ValueKey('noti-row-bg'),
        color: AppTokens.surface, // NOTI-READ-03: 배경을 물들이지 않는다(색은 4px 바에만)
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                key: const ValueKey('noti-bar'),
                width: 4,
                decoration: BoxDecoration(color: bar),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(notificationIcon(view.notificationType), size: 20, color: iconColor),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(notificationTitle(view.notificationType),
                                style: TextStyle(fontWeight: FontWeight.w600, color: titleColor)),
                            const SizedBox(height: 4),
                            // NOTI-BODY-01: 저장된 body 그대로(진료과·의사·증상 다시 안 붙임).
                            Text(view.body,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis, // 데모 truncate — 한 줄로 자른다
                                style: TextStyle(fontSize: 13, color: bodyColor)),
                            const SizedBox(height: 4),
                            Text(formatKoreanTime(view.sentAt),
                                style:
                                    const TextStyle(fontSize: 12, color: AppTokens.grayPending)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
