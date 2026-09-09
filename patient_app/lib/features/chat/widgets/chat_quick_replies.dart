import 'package:flutter/material.dart';
import '../../../core/tokens.dart';
import '../chat_models.dart';

/// 빠른답변 버튼 묶음(CCARD-QUICK). 시작 묶음은 앱이 다가오는 예약 유무로 고정 4개(AI 없음, START),
/// 대화 중은 서버가 만든 3~4개(MID). 누르면 그 문장을 환자 말풍선으로 전송(SEND). 자유 입력은 항상
/// 함께 열려 있고(INPUT), 생성 대기·실패에도 스켈레톤/오류를 만들지 않는다(LOAD·ERR) — 자유 입력만 유지.
// ⭐ 시작 묶음은 정본 카드사전 §8·백엔드 `quick_replies.py`(START_NO_UPCOMING)와 **글자까지 동일**해야
// 한다. 예전엔 앱이 `증상 상담`·`병원 위치·시간` 같은 **짧은 파편**을 썼는데, 파편은 문장이 아니라
// 백엔드 인계 분류기가 handoff(reply 없음)로 빼 **눌러도 무응답**이 됐다(2026-09-08 실기기). 구체적
// 질문문으로 맞추면 전부 rag/department_guide/agent로 깨끗이 응답한다(probe 확증).
const _startUpcoming = ['내 예약 확인해줘', '예약을 바꾸고 싶어요', '진료 전에 준비할 게 있나요', '주차할 수 있나요'];
const _startNoUpcoming = ['진료시간이 어떻게 되나요', '어느 과에 가야 할지 모르겠어요', '예약하려면 어떻게 하나요', '주차할 수 있나요'];

List<String> startQuickReplies({required bool hasUpcoming}) =>
    hasUpcoming ? _startUpcoming : _startNoUpcoming;

/// 피드 마지막 줄에 따라 입력창 슬롯의 칩을 정한다(상시 버튼 폐지 후 유일한 [직원에게 연결] 출구, Q5).
///  · no_answer 안내(WEBCHAT-NOANS): 마지막이 quick_replies 카드면 그 FAQ 옵션 + [직원에게 연결] 칩.
///  · 일반 봇 답변(Q5 ②)·무답변 안내(Q11): 마지막이 봇 말풍선이면 FAQ 옵션 없이 [직원에게 연결] 칩만.
///  · 환자 발화가 마지막(봇 대기 중)이면 칩 없음 → 새 봇 답변이 오면 다시 뜬다(칩이 남지 않는다).
// #6(2026-09-08): 이 칩 문구는 백엔드 orchestrator.HANDOFF_CONFIRM_CHIP과 정확히 같아야 한다 —
//   탭하면 ⓠ-a로 한 번에 인계된다. (자유 입력 "직원 연결"은 ⓠ-b에서 확인 프롬프트로 가지만, 칩 탭은 명시 선택.)
const _staffHandoffChip = '직원에게 연결하기';

({List<String> replies, String? handoffLabel})? activeQuickReplies(List<ChatFeedItem> items) {
  if (items.isEmpty) return null;
  final last = items.last;
  if (last.cardType == 'quick_replies') {
    final p = last.payload ?? const {};
    final opts = (p['options'] as List?)?.cast<String>() ?? const <String>[];
    return (replies: opts, handoffLabel: p['handoff_chip'] as String?);
  }
  // Q5·Q11: 가장 최근이 봇 답변(일반/무답변 안내)이면 [직원에게 연결] 칩만 — 매 말풍선 상시 버튼을 대체한다.
  if (last.senderType == 'bot') {
    return (replies: const <String>[], handoffLabel: _staffHandoffChip);
  }
  return null;
}

class ChatQuickReplies extends StatelessWidget {
  final List<String> replies;
  final void Function(String) onSend;
  final bool freeInputOpen, generating, generateFailed;
  final String? handoffLabel;      // 있으면 [직원에게 연결] 콜백 칩(WEBCHAT-NOANS) — 문장 전송이 아니라 인계로 전환
  final VoidCallback? onHandoff;
  const ChatQuickReplies({
    super.key,
    required this.replies,
    required this.onSend,
    this.freeInputOpen = true,
    this.generating = false,
    this.generateFailed = false,
    this.handoffLabel,
    this.onHandoff,
  });

  @override
  Widget build(BuildContext context) {
    // 생성 대기(generating)·실패(generateFailed)엔 아무 표시도 하지 않는다 —
    // 자유 입력만 열려 있게 두어 상담 오류로 확대하지 않는다(CCARD-QUICK-LOAD/ERR).
    final hasHandoff = handoffLabel != null;
    if (replies.isEmpty && !hasHandoff) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Wrap(spacing: 8, runSpacing: 8, children: [
        // Q13: 정본(homepage/webchat `.wc-chip`) 알약 — 흰 배경 + 딥틸 옅은 테두리 1.5px, 딥틸 글자.
        for (final r in replies) _chip(label: r, filled: false, onPressed: () => onSend(r)),
        if (hasHandoff) // 콜백 칩(WEBCHAT-NOANS) — FAQ 칩(테두리형)과 구분되게 딥틸 채움. 누르면 인계(문장 전송 아님).
          _chip(label: handoffLabel!, filled: true, onPressed: onHandoff),
      ]),
    );
  }

  /// 정본 칩 스타일(homepage/webchat `.wc-chip`) — 흰 알약 + 딥틸 옅은 테두리(FAQ) / 딥틸 채움(인계 콜백).
  /// `ActionChip`을 유지해 탭 시맨틱·기존 테스트(byType ActionChip)를 지킨다.
  Widget _chip({required String label, required bool filled, VoidCallback? onPressed}) {
    return ActionChip(
      label: Text(label,
          style: TextStyle(
            color: filled ? Colors.white : AppTokens.primary,
            fontWeight: FontWeight.w600,
          )),
      backgroundColor: filled ? AppTokens.primary : AppTokens.surface,
      side: BorderSide(color: filled ? AppTokens.primary : AppTokens.primarySoft, width: 1.5),
      shape: const StadiumBorder(),
      elevation: 0,
      pressElevation: 0,
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
      visualDensity: VisualDensity.compact,
      onPressed: onPressed,
    );
  }
}
