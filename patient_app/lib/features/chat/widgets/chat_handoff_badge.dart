import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import '../../../core/tokens.dart';
import '../chat_models.dart';

/// 인계 상태 배지(CHAT-HANDOFF-*, Q18). webchat `HandoffBadge`와 동형 — 환자 관점 라벨만 보인다.
/// - **직원 확인 전이에요**(connecting): 인계됐고 아직 직원이 안 봄. 배정(claim)은 환자에게 숨긴다(Q18②).
/// - **직원이 확인 중이에요**(inProgress): 직원이 상담 상세를 **실제로 열어 보는 중**(열람 presence, `staffViewing`).
///   배정이 아니라 실열람일 때만 — connecting에 presence가 겹치면 이 라벨로 바뀐다.
/// - **답변 도착**(ended=answered): 직원이 답했다. 이때만 담당자 이름·역할을 노출한다.
/// 노출 문구는 CONNECTING_MSG 하나뿐 — 접수/등록·시간 약속 금지(정본 §0, Q18). 운영시간은 서버 hoursNote
/// (is_open(at))를 그대로 쓰고 예상시간을 짓지 않는다(HOURS). 조회 전=로딩(LOAD), 실패=오류+재시도(ERR).
class ChatHandoffBadge extends StatelessWidget {
  final HandoffStatus status;
  final bool staffViewing; // Q18③ 열람 presence — connecting에 겹치면 "직원이 확인 중이에요"
  final VoidCallback? onRetry;
  const ChatHandoffBadge(
      {super.key, required this.status, this.staffViewing = false, this.onRetry});

  // 환자 노출 문구는 이것만(접수/등록·시간 약속 금지) — webchat CONNECTING_MSG와 동일.
  static const _connectingMsg =
      '상담(직원 확인)으로 연결됐어요. 순서대로 확인해 답변드려요. 시간이 걸릴 수 있어요.';

  ({String label, Color color}) _phaseStyle(HandoffPhase p) => switch (p) {
        HandoffPhase.connecting => (label: '직원 확인 전이에요', color: AppTokens.badgeSky),
        HandoffPhase.inProgress => (label: '직원이 확인 중이에요', color: AppTokens.primary),
        HandoffPhase.ended => (label: '답변 도착', color: AppTokens.primary),
      };

  @override
  Widget build(BuildContext context) {
    if (status.loadError) {
      // ERR: 완료로 바꾸지 않고 오류 + 재시도만 노출한다.
      return Container(
        margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: AppTokens.surface,
          borderRadius: BorderRadius.circular(10),
          boxShadow: AppTokens.bubbleShadow,
        ),
        child: Row(children: [
          const Icon(AppIcons.error_outline, size: 16, color: AppTokens.warn),
          const SizedBox(width: 6),
          const Expanded(
              child: Text('상태를 불러오지 못했어요',
                  style: TextStyle(fontSize: 13, color: AppTokens.warn))),
          TextButton(onPressed: onRetry, child: const Text('다시 시도')),
        ]),
      );
    }
    if (status.phase == null) {
      // LOAD: 대기/완료를 추측하지 않고 로딩만.
      return const Padding(
        padding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: SizedBox(
            height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }
    // Q18③: connecting(직원 확인 전)에 열람 presence가 겹치면 "직원이 확인 중"으로 올린다.
    // answered(답변 도착)는 그대로 — 이미 답이 왔으니 열람 여부로 되돌리지 않는다.
    final effective = (status.phase == HandoffPhase.connecting && staffViewing)
        ? HandoffPhase.inProgress
        : status.phase!;
    final s = _phaseStyle(effective);
    final isEnded = effective == HandoffPhase.ended;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppTokens.surface,
        borderRadius: BorderRadius.circular(12),
        boxShadow: AppTokens.bubbleShadow,
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: s.color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(s.label,
              style: TextStyle(
                  fontSize: 13, fontWeight: FontWeight.w700, color: s.color)),
          // 답변 도착일 때만 담당자(이름·역할) — 그 전엔 배정을 숨긴다(Q18②).
          if (isEnded && status.assigneeName != null) ...[
            const SizedBox(width: 8),
            Flexible(
              child: Text('${status.assigneeName} · ${status.assigneeRole ?? ''}',
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, color: AppTokens.grayPending)),
            ),
          ],
        ]),
        if (status.hoursNote != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            // HOURS-01·02·03: 서버 판정 문구만(앱이 요일·점심·특정일을 재계산하지 않음).
            child: Text(status.hoursNote!,
                style: const TextStyle(fontSize: 12, color: AppTokens.warn)),
          ),
        // 답변 전엔 연결 안내만(시간 약속 없음). 답변 도착이면 담당자·대화가 안내를 대신한다.
        if (!isEnded)
          const Padding(
            padding: EdgeInsets.only(top: 6),
            child: Text(_connectingMsg,
                style: TextStyle(fontSize: 12, color: AppTokens.grayPending, height: 1.5)),
          ),
      ]),
    );
  }
}
