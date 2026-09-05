import 'package:flutter/material.dart';
import '../../../core/tokens.dart';
import '../chat_models.dart';

/// 빠른답변 버튼 묶음(CCARD-QUICK). 시작 묶음은 앱이 다가오는 예약 유무로 고정 4개(AI 없음, START),
/// 대화 중은 서버가 만든 3~4개(MID). 누르면 그 문장을 환자 말풍선으로 전송(SEND). 자유 입력은 항상
/// 함께 열려 있고(INPUT), 생성 대기·실패에도 스켈레톤/오류를 만들지 않는다(LOAD·ERR) — 자유 입력만 유지.
const _startUpcoming = ['예약 확인하고 싶어요', '예약을 변경하고 싶어요', '문진 작성할래요', '병원 이용 안내'];
const _startNoUpcoming = ['예약하고 싶어요', '진료과를 모르겠어요', '병원 위치·시간', '증상 상담'];

List<String> startQuickReplies({required bool hasUpcoming}) =>
    hasUpcoming ? _startUpcoming : _startNoUpcoming;

/// no_answer 안내(WEBCHAT-NOANS): 봇이 못 답하면 피드 마지막에 quick_replies 카드가 온다. 앱은 이 카드를
/// 피드 카드가 아니라 입력창 슬롯의 칩으로 띄운다 → 마지막 줄이 quick_replies 카드일 때 그 옵션·handoff를 준다.
/// 사용자가 칩을 누르거나 새 봇 답변이 오면 마지막 줄이 바뀌어 자동으로 사라진다(칩이 남지 않는다).
({List<String> replies, String? handoffLabel})? activeQuickReplies(List<ChatFeedItem> items) {
  if (items.isEmpty) return null;
  final last = items.last;
  if (last.cardType != 'quick_replies') return null;
  final p = last.payload ?? const {};
  final opts = (p['options'] as List?)?.cast<String>() ?? const <String>[];
  return (replies: opts, handoffLabel: p['handoff_chip'] as String?);
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
      child: Wrap(spacing: 6, runSpacing: 6, children: [
        for (final r in replies) ActionChip(label: Text(r), onPressed: () => onSend(r)),
        if (hasHandoff) // 콜백 칩 — FAQ 칩(테두리형)과 구분되게 딥틸 채움. 누르면 인계(문장 전송 아님).
          ActionChip(
            label: Text(handoffLabel!, style: const TextStyle(color: Colors.white)),
            backgroundColor: AppTokens.primary,
            onPressed: onHandoff),
      ]),
    );
  }
}
