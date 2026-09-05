import 'package:flutter/material.dart';
import '../../widgets/patient_app_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/connectivity.dart';
import '../../core/tokens.dart';
import '../../widgets/block_dialog.dart';
import '../../widgets/inline_error.dart';
import 'notification_prefs_repository.dart';

// [SET-NOTI-04] 2묶음 · 6토글. (group, 라벨, 중요 여부). 「받는 방법」·「문자로도 받기」 묶음은 없다(B-41).
const _groups = <(String, List<(String, String, bool)>)>[
  ('예약에 관한 알림', [
    ('appt_change', '예약 변경·취소 안내', true), // ⭐ 중요(SET-NOTI-05)
    ('appt_status', '예약 신청·확정 안내', false),
    ('appt_reminder', '예약 전날·당일 안내', false),
  ]),
  ('그 밖의 알림', [
    ('questionnaire', '사전문진 안내', false),
    ('visit_note', '진료 후 안내', false),
    ('support_reply', '상담 답변 안내', false),
  ]),
];

class NotificationSettingsScreen extends ConsumerStatefulWidget {
  const NotificationSettingsScreen({super.key});

  @override
  ConsumerState<NotificationSettingsScreen> createState() => _NotificationSettingsScreenState();
}

class _NotificationSettingsScreenState extends ConsumerState<NotificationSettingsScreen> {
  bool _importantWarnShown = false; // [SET-NOTI-10] 중요 알림 끄기 안내는 한 번만

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(notificationSettingsControllerProvider.notifier).load();
    });
  }

  void _onToggle(String group, bool important, bool current) {
    final controller = ref.read(notificationSettingsControllerProvider.notifier);
    // [SET-NOTI-07~10] 중요 알림을 끄려 할 때만, 아직 안내 안 봤으면 팝업. 그 밖·두 번째부터는 바로.
    if (important && current && !_importantWarnShown) {
      showBlockDialog(
        context,
        title: '중요 알림을 끄시겠어요?',
        message: '병원 사정으로 예약 시간이 바뀌거나 취소될 때 앱에서 알려드릴 수 없습니다. '
            '다만 일정이 바뀌면 병원에서 전화로도 안내드립니다. 연락처가 바뀌셨다면 설정에서 확인해 주세요.',
        cancelLabel: '그대로 둘게요',   // [SET-NOTI-09] 막지 않는다 — 빠져나갈 문
        confirmLabel: '끄기',           // [SET-NOTI-09] 그래도 끌 수 있다
        onConfirm: () {
          setState(() => _importantWarnShown = true);
          controller.toggle(group, false);
        },
      );
      setState(() => _importantWarnShown = true); // 「그대로 둘게요」로 닫아도 다시 안 뜬다
      return;
    }
    controller.toggle(group, !current);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(notificationSettingsControllerProvider);
    final offline = ref.watch(connectivityProvider).valueOrNull == false;

    return Scaffold(
      appBar: const PatientAppBar(title: '알림 설정'),
      body: state.loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                // [SET-NOTI-15] 화면은 「거르는 자리」를 설명한다 — 발송을 흉내내지 않는다.
                const Text('알림을 움직이면 바로 저장됩니다.',
                    style: TextStyle(fontSize: 14, color: AppTokens.grayPending)),
                if (offline) ...[
                  const SizedBox(height: 8),
                  const Text('인터넷에 연결되면 알림을 바꿀 수 있습니다.', // [SET-HOME-16] 이유 한 줄
                      style: TextStyle(fontSize: 13, color: AppTokens.warn)),
                ],
                const SizedBox(height: 16),
                for (final (title, items) in _groups) ...[
                  Text(title,
                      style: const TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w600, color: AppTokens.grayPending)),
                  const SizedBox(height: 8),
                  Container(
                    // 데모 알림 토글 리스트 = rounded-xl border bg-card(테두리, 그림자 없음).
                    decoration: BoxDecoration(
                      color: AppTokens.surface,
                      border: Border.all(color: AppTokens.border),
                      borderRadius: BorderRadius.circular(AppTokens.densityCardRadius),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: Material(
                      color: AppTokens.surface, // ListTile ink·bg는 Material 조상에서(색 있는 DecoratedBox 금지)
                      child: Column(
                      children: [
                        for (final (group, label, important) in items)
                          _ToggleRow(
                            group: group,
                            label: label,
                            important: important,
                            value: state.prefs[group] ?? true,
                            busy: state.busy.contains(group),
                            error: state.errorFor[group],
                            enabled: !offline,
                            onTap: () => _onToggle(group, important, state.prefs[group] ?? true),
                          ),
                      ],
                    ),
                    ),
                  ),
                  const SizedBox(height: 20),
                ],
              ],
            ),
    );
  }
}

class _ToggleRow extends StatelessWidget {
  const _ToggleRow({
    required this.group,
    required this.label,
    required this.important,
    required this.value,
    required this.busy,
    required this.error,
    required this.enabled,
    required this.onTap,
  });
  final String group, label;
  final bool important, value, busy, enabled;
  final String? error;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: Key('noti-$group'),
      decoration: BoxDecoration(
        // [SET-NOTI-05] 중요 알림만 왼쪽 4px 붉은 띠(배경은 안 칠함).
        border: Border(
          left: BorderSide(color: important ? AppTokens.warn : Colors.transparent, width: 4),
          bottom: const BorderSide(color: AppTokens.border, width: 1),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SwitchListTile(
            key: Key('switch-$group'),
            value: value,
            // [SET-NOTI-14] 저장 중엔 그 토글만 잠근다. 오프라인이면 전체 잠금(enabled=false).
            onChanged: (busy || !enabled) ? null : (_) => onTap(),
            activeThumbColor: AppTokens.primary,
            title: Text(label,
                style: TextStyle(
                    fontWeight: FontWeight.w500,
                    color: important ? AppTokens.warn : AppTokens.onSurface)),
            subtitle: important
                ? const Text('병원 사정으로 예약이 바뀔 때 알려드립니다.',
                    style: TextStyle(fontSize: 12, color: AppTokens.grayPending))
                : null,
          ),
          if (error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: InlineError(error), // [SET-NOTI-13] 그 줄 아래 오류 한 줄
            ),
        ],
      ),
    );
  }
}
