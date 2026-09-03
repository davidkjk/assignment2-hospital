import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/tokens.dart';
import '../../../widgets/dashed_border.dart';
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
                  padding: const EdgeInsets.only(top: 4),
                  child: _DeptBotEntry(onTap: () => openDeptBot(context)),
                ),
              ],
            ),
    );
  }
}

// BOOK-DEPT-02 — 점선 테두리 + 연한 딥틸 배경, "어느 과인지 모르겠어요" + 안내 한 줄.
class _DeptBotEntry extends StatelessWidget {
  const _DeptBotEntry({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      // BOOK-DEPT-02 — 데모 border-dashed border-primary/40 bg-primary/5 (점선 + 연한 딥틸 틴트).
      child: DottedBorder(
        color: AppTokens.primary.withValues(alpha: 0.4),
        radius: 18,
        backgroundColor: AppTokens.primary.withValues(alpha: 0.06),
        padding: const EdgeInsets.all(16),
        child: const Column(children: [
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(AppIcons.help, size: 18, color: AppTokens.primary),
            SizedBox(width: 8),
            Text('어느 과인지 모르겠어요',
                style: TextStyle(color: AppTokens.primary, fontWeight: FontWeight.w600)),
          ]),
          SizedBox(height: 4),
          Text('증상을 말씀하시면 AI 상담봇이 안내해드립니다',
              style: TextStyle(fontSize: 12, color: AppTokens.grayPending)),
        ]),
      ),
    );
  }
}

// NAV-BOOK-06 — 상담봇 시트를 연다(화면을 떠나지 않는 겹침). ⚠️ 시트 UI(BOOK-BOT-*)는 Task 20이 실체화.
Future<void> openDeptBot(BuildContext context) => showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => const DeptBotSheet(), // Task 20이 채운다. 지금은 진입/닫힘 라우팅만 검증.
    );
