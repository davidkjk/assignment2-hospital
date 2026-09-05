import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import '../../../core/tokens.dart';
import '../chat_models.dart';

/// 인계 상태 배지(CHAT-HANDOFF-*). 담당자는 서버가 확정한 현재 한 명만 표시한다
/// (CHAT-ROOM-LIVE-STAFF-01 A안) — 배정 경쟁·이관 이력·"이관 중" 중간 상태는 그리지 않는다.
/// 운영시간 안내는 서버 hoursNote(is_open(at) 판정)를 그대로 쓰고 예상시간을 짓지 않는다(HOURS).
/// 조회 전은 로딩(LOAD), 실패는 오류+재시도(ERR) — 둘 다 완료로 위장하지 않는다.
class ChatHandoffBadge extends StatelessWidget {
  final HandoffStatus status;
  final VoidCallback? onRetry;
  const ChatHandoffBadge({super.key, required this.status, this.onRetry});

  ({String label, Color color}) _phaseStyle(HandoffPhase p) => switch (p) {
        HandoffPhase.connecting => (label: '직원 연결 중', color: AppTokens.badgeSky),
        HandoffPhase.inProgress => (label: '직원 상담 중', color: AppTokens.primary),
        HandoffPhase.ended => (label: '상담 종료', color: AppTokens.badgeSlate),
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
          border: Border.all(color: AppTokens.border),
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
    final s = _phaseStyle(status.phase!);
    final showAssignee =
        status.phase == HandoffPhase.inProgress && status.assigneeName != null;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppTokens.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppTokens.border),
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
                  fontSize: 13, fontWeight: FontWeight.w600, color: s.color)),
        ]),
        if (showAssignee)
          Padding(
            padding: const EdgeInsets.only(top: 2, left: 14),
            // STATE-02·LIVE-STAFF: 서버 확정 현재 담당자만(이름 · 역할).
            child: Text('${status.assigneeName} · ${status.assigneeRole ?? ''}',
                style: const TextStyle(fontSize: 12, color: AppTokens.onSurface)),
          ),
        if (status.hoursNote != null)
          Padding(
            padding: const EdgeInsets.only(top: 2, left: 14),
            // HOURS-01·02·03: 서버 판정 문구만(앱이 요일·점심·특정일을 재계산하지 않음).
            child: Text(status.hoursNote!,
                style: const TextStyle(fontSize: 12, color: AppTokens.grayPending)),
          ),
      ]),
    );
  }
}
