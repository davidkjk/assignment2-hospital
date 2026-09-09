import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import '../../../core/tokens.dart';
import '../chat_models.dart';

/// 인계 상태 색·라벨·LED 점(CHAT-HANDOFF-*, Q18 / #9 재설계 2026-09-08).
///
/// #9(사용자 요청): 긴 설명 배너 대신 → **헤더("AI 상담봇") 옆에 짧은 상태**([ChatHandoffHeaderStatus])
///   + 안내 멘트 왼쪽에 상태색 **LED 느낌 점**(은은한 글로우). 자리를 덜 차지하게.
///
/// dot/glow 색은 흰 카드(피드)와 딥틸 밴드(헤더) 둘 다에서 읽히는 밝은 계열로 고른다.
/// glow 는 같은 색의 반투명(알파 ≈0.55) — 코드 관용대로 ARGB 헥사로 못박아 withOpacity 경고를 피한다.
class _HandoffVisual {
  static const amber = Color(0xFFF59E0B), amberGlow = Color(0x8CF59E0B);
  static const sky = Color(0xFF38BDF8), skyGlow = Color(0x8C38BDF8);
  static const green = Color(0xFF2FBF71), greenGlow = Color(0x8C2FBF71);

  // - connecting(직원 확인 전): 인계됐고 아직 답 없음. 배정(claim)은 환자에게 숨긴다(Q18②).
  // - inProgress(직원 확인 중): 직원이 상담 상세를 **실제로 열어 보는 중**(열람 presence, staffViewing).
  // - ended(답변 도착): 직원 답장이 왔다(#8: 티켓 status가 아니라 답장 존재로 판정 — webchat_service).
  static ({Color dot, Color glow, String label}) of(HandoffPhase p) => switch (p) {
        HandoffPhase.connecting => (dot: amber, glow: amberGlow, label: '직원 확인 전'),
        HandoffPhase.inProgress => (dot: sky, glow: skyGlow, label: '직원 확인 중'),
        HandoffPhase.ended => (dot: green, glow: greenGlow, label: '답변 도착'),
      };
}

/// 상태색 LED 점 — 은은한 글로우(엘이디 느낌). size=점 지름.
Widget _ledDot(Color dot, Color glow, {double size = 9}) => Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: dot,
        shape: BoxShape.circle,
        boxShadow: [BoxShadow(color: glow, blurRadius: 6, spreadRadius: 1)],
      ),
    );

/// connecting 에 presence(staffViewing)가 겹치면 '직원 확인 중'으로 올린다. answered(답변 도착)는 그대로.
HandoffPhase _effectivePhase(HandoffStatus status, bool staffViewing) =>
    (status.phase == HandoffPhase.connecting && staffViewing)
        ? HandoffPhase.inProgress
        : status.phase!;

/// #9 헤더 상태 — 앱바 "AI 상담봇" 오른쪽에 붙는 짧은 상태(LED 점 + 라벨, 흰 글자).
/// 인계 전(phase null)·조회 실패면 아무것도 안 보인다(오류 안내는 피드 배지가 맡는다).
class ChatHandoffHeaderStatus extends StatelessWidget {
  final HandoffStatus status;
  final bool staffViewing;
  const ChatHandoffHeaderStatus(
      {super.key, required this.status, this.staffViewing = false});

  @override
  Widget build(BuildContext context) {
    if (status.phase == null) return const SizedBox.shrink();
    final effective = _effectivePhase(status, staffViewing);
    final v = _HandoffVisual.of(effective);
    // Q18④: 답변 도착(ended)일 때만 담당자 이름을 짧게 덧붙인다(그 전엔 배정을 숨김). 오버플로는 말줄임.
    final showName = effective == HandoffPhase.ended && status.assigneeName != null;
    return Row(mainAxisSize: MainAxisSize.min, children: [
      _ledDot(v.dot, v.glow, size: 8),
      const SizedBox(width: 6),
      Text(v.label,
          style: const TextStyle(
              fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white)),
      if (showName)
        Flexible(
          child: Text(' · ${status.assigneeName}',
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12, color: Colors.white70)),
        ),
    ]);
  }
}

/// 인계 안내 멘트(피드 상단). #9: 상태 라벨은 헤더로 옮겼고, 여기선 **왼쪽 LED 점 + 안내 문구**만 슬림하게.
/// - connecting/inProgress: 연결 안내(시간 약속 없음) + LED 점.
/// - ended(답변 도착): 배너를 아예 접는다 — 헤더가 '답변 도착'을 표시하고 직원 말풍선이 대화를 잇는다(#8).
/// 노출 문구는 CONNECTING_MSG 하나뿐(접수/등록·시간 약속 금지, 정본 §0·Q18). 운영시간은 서버 hoursNote만.
class ChatHandoffBadge extends StatelessWidget {
  final HandoffStatus status;
  final bool staffViewing;
  final VoidCallback? onRetry;
  const ChatHandoffBadge(
      {super.key, required this.status, this.staffViewing = false, this.onRetry});

  static const _connectingMsg =
      '상담(직원 확인)으로 연결됐어요. 순서대로 확인해 답변드려요. 시간이 걸릴 수 있어요.';

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
    final effective = _effectivePhase(status, staffViewing);
    // #8·#9: 답변이 오면(ended) 상단 안내 배너는 접는다 — 헤더가 '답변 도착'을 표시한다.
    if (effective == HandoffPhase.ended) return const SizedBox.shrink();
    final v = _HandoffVisual.of(effective);
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
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // 안내 멘트 왼쪽 LED 점(#9) — 글자 첫 줄 높이에 맞춰 살짝 내린다.
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: _ledDot(v.dot, v.glow),
          ),
          const SizedBox(width: 8),
          const Expanded(
            child: Text(_connectingMsg,
                style: TextStyle(
                    fontSize: 12, color: AppTokens.grayPending, height: 1.5)),
          ),
        ]),
        if (status.hoursNote != null)
          Padding(
            padding: const EdgeInsets.only(top: 6, left: 17),
            // HOURS-01·02·03: 서버 판정 문구만(앱이 요일·점심·특정일을 재계산하지 않음).
            child: Text(status.hoursNote!,
                style: const TextStyle(fontSize: 12, color: AppTokens.warn)),
          ),
      ]),
    );
  }
}
