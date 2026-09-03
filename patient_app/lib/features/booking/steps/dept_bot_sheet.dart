import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/tokens.dart';
import '../../../widgets/action_button.dart';
import '../../chat/restricted_chat.dart';
import '../booking_controller.dart';
import '../catalog_repository.dart';

// 엔진(4단계 ai-chatbot)이 좁혀준 진료과. 스텁=null. ⚠️ 계약: 「진료과 추천만」 반환 타입.
final deptBotSuggestionProvider = Provider<Department?>((ref) => null);

// BOOK-DEPT-02 / NAV-BOOK-06 — "어느 과인지 모르겠어요" 상담봇 시트(정본 BOOK-BOT-*).
// ⚠️ 제한 모드 계약: 행동형 도구 전부 금지, 유일한 출구는 ○○과로 계속하기, 119 안전 안내만 예외(결정 E4).
//    대화 엔진은 ai-chatbot 플랜 소유 — 여기선 시트 UI + 모드 계약을 세우고 대화는 스텁으로 둔다.
class DeptBotSheet extends ConsumerWidget {
  const DeptBotSheet({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sel = ref.watch(bookingProvider);
    final suggested = ref.watch(deptBotSuggestionProvider);
    // 제한모드 엔진(ai-chatbot Task 12)에 예약 대상 맥락(UUID·관계)을 넘겨 다시 묻지 않게 한다
    // (BOOKBOT-SHEET-CONTEXT-01). 행동형 카드는 전부 금지되고 유일 출구는 ○○과로 계속하기(결정 E4).
    final chat = RestrictedChatController(
      forPatientId: sel.target?.patientId ?? '',
      relation: sel.target?.relation ?? '본인',
    );
    return Padding(
      padding: MediaQuery.of(context).viewInsets,
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        // 헤더 — 딥틸 밴드. 제목은 "AI 상담봇"(BOOK-BOT-02, 챗봇 아님).
        Container(
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
              icon: const Icon(AppIcons.cancel), // BOOK-BOT-03 원형 X(쓸어내림도 됨)
              color: Colors.white,
              iconSize: 40,
              onPressed: () => Navigator.of(context).pop(),
            ),
          ]),
        ),
        // 안전 고지 — 진단 아님(제한 모드).
        Container(
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
        ),
        // 대화 영역 — 제한모드 엔진이 예약 대상 맥락을 갖고 진입한다(BOOK-BOT-07 행동형 도구 안 띄움).
        // 실 대화 스트림은 서버 오케스트레이터(제한모드)가 채우고, 여기선 대상 맥락을 문구에 반영한다.
        Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
              chat.relation == '본인'
                  ? '증상을 말씀해 주시면 맞는 진료과를 안내해 드릴게요.'
                  : '${chat.relation} 증상을 말씀해 주시면 맞는 진료과를 안내해 드릴게요.',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 14, color: AppTokens.grayPending)),
        ),
        if (suggested != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            child: Column(children: [
              ActionButton(
                label: '${suggested.name}로 계속하기', // BOOK-BOT-04·05 유일한 출구
                busyLabel: '${suggested.name}로 계속하기',
                onPressed: () {
                  ref.read(bookingProvider.notifier).selectDepartment(suggested); // NAV-BOOK-07 → 3단계
                  Navigator.of(context).pop();
                },
              ),
              const SizedBox(height: 8),
              Text(
                '예약을 계속 진행 중입니다 · ${sel.target?.relation ?? '본인'} (${sel.target?.name ?? ''})',
                style: const TextStyle(fontSize: 12, color: AppTokens.grayPending), // BOOK-BOT-04 회색 보조
              ),
            ]),
          ),
      ]),
    );
  }
}
