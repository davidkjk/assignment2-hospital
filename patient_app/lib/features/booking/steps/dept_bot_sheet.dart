import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/tokens.dart';
import '../../../widgets/action_button.dart';
import '../../chat/widgets/chat_bubble.dart';
import '../../chat/widgets/chat_input_bar.dart';
import '../../chat/widgets/chat_typing_indicator.dart';
import '../booking_controller.dart';
import '../catalog_repository.dart';
import 'dept_bot_controller.dart';

// 라이브 대화가 없을 때(테스트 주입점)의 추천 폴백. 평소엔 null — 실제 추천은 DeptBotController가 채운다.
final deptBotSuggestionProvider = Provider<Department?>((ref) => null);

// BOOK-DEPT-02 / NAV-BOOK-06 — "어느 과인지 모르겠어요" 상담봇 시트(정본 BOOK-BOT-*).
// 제한모드 계약(결정 E4): 행동형 카드·예약/취소/직원인계 없음. 유일한 출구는 [○○과로 계속하기], 119 예외.
// 채팅 UI 부품(ChatBubble·ChatInputBar·ChatTypingIndicator)은 일반 상담방과 공유하되, 세션·스레드는
// 만들지 않는다(겹침 도우미) — 대화는 DeptBotController가 /chat/dept-guide로 무상태로 주고받는다.
class DeptBotSheet extends ConsumerWidget {
  const DeptBotSheet({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sel = ref.watch(bookingProvider);
    final st = ref.watch(deptBotControllerProvider);
    final ctl = ref.read(deptBotControllerProvider.notifier);
    // 추천: 라이브 대화가 잡은 것 우선, 없으면 주입 폴백(레거시 계약 — 위젯 테스트).
    final suggested = st.suggested ?? ref.watch(deptBotSuggestionProvider);
    final relation = sel.target?.relation ?? '본인';

    return Padding(
      padding: MediaQuery.of(context).viewInsets,
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        _Header(),
        const _SafetyBanner(),
        // 대화 영역 — 화면 절반 이내로 스크롤. 겹침 시트라 화면을 떠나지 않는다.
        Flexible(
          child: ConstrainedBox(
            constraints:
                BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.42),
            child: st.items.isEmpty
                ? _Greeting(relation: relation) // 첫 진입 — 봇 말풍선 아님(헤더 제목과 라벨 중복 방지)
                : ListView.builder(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    shrinkWrap: true,
                    itemCount: st.items.length,
                    itemBuilder: (ctx, i) {
                      final it = st.items[i];
                      final isPatient = it.senderType == 'patient';
                      return Align(
                        alignment:
                            isPatient ? Alignment.centerRight : Alignment.centerLeft,
                        child: ChatBubble(item: it),
                      );
                    },
                  ),
          ),
        ),
        if (st.sending)
          const ChatTypingIndicator(label: '상담봇이 입력 중'), // CHAT-ROOM-BOT-TYPING-01 재사용
        if (st.errored) _ErrorRow(onRetry: ctl.retryLast),
        // 추천이 잡히면 유일 행동 출구(BOOK-BOT-04·05).
        if (suggested != null)
          _ContinueBlock(
            suggested: suggested,
            relation: relation,
            name: sel.target?.name ?? '',
            onContinue: () {
              ref.read(bookingProvider.notifier).selectDepartment(suggested); // NAV-BOOK-07 → 3단계
              Navigator.of(context).pop();
            },
          ),
        // 자유 입력은 항상 열려 있다(제한모드여도) — 증상을 입력하면 봇이 진료과를 안내한다.
        ChatInputBar(onSend: ctl.send),
      ]),
    );
  }
}

// 헤더 — 딥틸 밴드. 제목은 "AI 상담봇"(BOOK-BOT-02). 원형 X 40px로 닫는다(BOOK-BOT-03, 쓸어내림도 됨).
class _Header extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Container(
        color: AppTokens.primary,
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
        child: Row(children: [
          const Icon(AppIcons.auto_awesome, color: Colors.white, size: 20),
          const SizedBox(width: 8),
          const Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('AI 상담봇',
                  style: TextStyle(
                      color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
              Text('진료과 선택을 돕고 있어요',
                  style: TextStyle(color: Colors.white70, fontSize: 12)),
            ]),
          ),
          IconButton(
            icon: const Icon(AppIcons.cancel),
            color: Colors.white,
            iconSize: 40,
            onPressed: () => Navigator.of(context).pop(),
          ),
        ]),
      );
}

// 안전 고지 — 진단 아님(제한 모드).
class _SafetyBanner extends StatelessWidget {
  const _SafetyBanner();
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        color: AppTokens.primary.withValues(alpha: 0.05),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: const Row(children: [
          Icon(AppIcons.verified_user, size: 16, color: AppTokens.primary),
          SizedBox(width: 8),
          Expanded(
            child: Text('진단이 아닌 진료과 안내예요. 최종 선택은 직접 확인해 주세요.',
                style: TextStyle(fontSize: 12, color: AppTokens.primary)),
          ),
        ]),
      );
}

// 첫 진입 안내(대화 시작 전). 대상(본인/가족)에 맞춘 톤.
class _Greeting extends StatelessWidget {
  const _Greeting({required this.relation});
  final String relation;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          relation == '본인'
              ? '증상을 말씀해 주시면 맞는 진료과를 안내해 드릴게요.'
              : '$relation 증상을 말씀해 주시면 맞는 진료과를 안내해 드릴게요.',
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 14, color: AppTokens.grayPending),
        ),
      );
}

// 봇 응답 실패 — 시트를 닫지 않고(막다른 길 금지) 자유 입력 유지 + [다시 시도].
class _ErrorRow extends StatelessWidget {
  const _ErrorRow({required this.onRetry});
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        child: Row(children: [
          const Icon(AppIcons.error_outline, size: 16, color: AppTokens.warn),
          const SizedBox(width: 8),
          const Expanded(
            child: Text('답변을 불러오지 못했어요',
                style: TextStyle(fontSize: 12, color: AppTokens.warn)),
          ),
          TextButton(onPressed: onRetry, child: const Text('다시 시도')),
        ]),
      );
}

// 추천 진료과가 잡혔을 때의 유일 행동 출구(BOOK-BOT-04·05).
class _ContinueBlock extends StatelessWidget {
  const _ContinueBlock({
    required this.suggested,
    required this.relation,
    required this.name,
    required this.onContinue,
  });
  final Department suggested;
  final String relation, name;
  final VoidCallback onContinue;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
        child: Column(children: [
          ActionButton(
            label: '${suggested.name}로 계속하기',
            busyLabel: '${suggested.name}로 계속하기',
            onPressed: onContinue,
          ),
          const SizedBox(height: 8),
          Text(
            '예약을 계속 진행 중입니다 · $relation ($name)',
            style: const TextStyle(fontSize: 12, color: AppTokens.grayPending),
          ),
        ]),
      );
}
