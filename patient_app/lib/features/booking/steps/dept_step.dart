import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/tokens.dart';
import '../../../widgets/empty_state.dart';
import '../booking_controller.dart';
import '../booking_widgets.dart';
import '../catalog_repository.dart';
import 'dept_bot_sheet.dart';

// 2단계 — 진료과(BOOK-DEPT-*). 이름만 굵게 + 우측 화살표. 맨 아래 상담 진입점(BOOK-DEPT-02).
class DeptStep extends ConsumerWidget {
  const DeptStep({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final depts = ref.watch(departmentsProvider);
    return depts.when(
      error: (_, __) =>
          EmptyState.error(onRetry: () => ref.invalidate(departmentsProvider)), // BOOK-NAV-10
      loading: () => const Center(child: CircularProgressIndicator()),
      data: (list) => list.isEmpty
          ? EmptyState.zero(message: '표시할 진료과가 없습니다') // BOOK-DEPT-03 — [다시 시도] 없음
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Padding(
                  padding: EdgeInsets.only(bottom: 16),
                  child: Text('어느 진료과를 찾으세요?',
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                ),
                for (final d in list)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: BookingSelectCard(
                      onTap: () => ref.read(bookingProvider.notifier).selectDepartment(d),
                      child: Row(children: [
                        Expanded(
                          child: Text(d.name, // BOOK-DEPT-01 이름만 굵게
                              style:
                                  const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                        ),
                        const Icon(AppIcons.chevron_right, color: AppTokens.primary),
                      ]),
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: _DeptBotEntry(onTap: () => openDeptBot(context)),
                ),
              ],
            ),
    );
  }
}

// BOOK-DEPT-02 — "어느 과인지 모르겠어요" 상담봇 진입점.
// #25(2026-09-05): 데모 점선(border-dashed)이 버튼처럼 안 보여 실선 틴트 카드로 갈랐으나,
//   그래도 위 진료과 카드(흰 카드+화살표)와 같은 모양이라 "또 하나의 흐린 카드 줄"로 읽혔다(사용자 재지적).
// → 카드 목록과 의도적으로 다른 "톤 버튼"으로 재디자인: 딥틸 원형 아이콘 배지(누르는 액션의 핵심 신호)
//   + 솔리드 톤 면 + 화살표 제거(목록 이동 어포던스라 버튼감을 죽임). 주 버튼(ActionButton)보다는 조용하게.
class _DeptBotEntry extends StatelessWidget {
  const _DeptBotEntry({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppTokens.primary.withValues(alpha: 0.10), // 옅은 카드가 아니라 채워진 톤 버튼 면
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: const Padding(
          padding: EdgeInsets.all(14),
          child: Row(children: [
            // 원형 딥틸 배지 + 흰 물음표 — 흰 카드 목록과 갈라 "누르는 버튼"임을 못박는 신호.
            _BadgeIcon(),
            SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('어느 과인지 모르겠어요',
                    style: TextStyle(
                        color: AppTokens.primary, fontWeight: FontWeight.w700, fontSize: 15)),
                SizedBox(height: 2),
                Text('증상을 말씀하시면 AI 상담봇이 안내해드립니다',
                    style: TextStyle(fontSize: 12, color: AppTokens.grayPending)),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

class _BadgeIcon extends StatelessWidget {
  const _BadgeIcon();
  @override
  Widget build(BuildContext context) => Container(
        width: 40,
        height: 40,
        decoration: const BoxDecoration(color: AppTokens.primary, shape: BoxShape.circle),
        child: const Icon(AppIcons.help, size: 22, color: Colors.white),
      );
}

// NAV-BOOK-06 — 상담봇 시트를 연다(화면을 떠나지 않는 겹침). ⚠️ 시트 UI(BOOK-BOT-*)는 Task 20이 실체화.
Future<void> openDeptBot(BuildContext context) => showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => const DeptBotSheet(), // Task 20이 채운다. 지금은 진입/닫힘 라우팅만 검증.
    );
