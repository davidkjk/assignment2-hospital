import 'package:flutter/material.dart';
import '../../../core/tokens.dart';

/// 직원 상담 종료 경계(CHAT-ROOM-END-01) + 분기(CHAT-ROOM-END-NAV-01).
/// [이어서 AI 질문]=직전 상담 요약(서버)을 가진 새 AI 상담 · [새 질문]=과거 문맥 없는 새 AI 상담.
/// 완료 티켓을 다시 여는 버튼은 두지 않는다. AI 만료 방 재진입(CHAT-ROOM-AI-REOPEN-01)은
/// 같은 두 분기를 라벨·문구만 바꿔 재사용한다.
///
/// 목업 119 ③: **경계 구분선**('직원 상담 종료' — 대화가 끝난 지점 표시) + **결정 카드**(제목·설명 + 두 버튼).
/// 이 위젯이 종료 시 입력창을 대신하므로(막다른 길 방지) 죽은 방에 계속 입력하는 사고를 막는다.
class ChatEndBoundary extends StatelessWidget {
  final VoidCallback onResumeAi;
  final VoidCallback onNewQuestion;
  final String message; // 경계 구분선 문구(대화가 끝난 지점)
  final String title; // 결정 카드 제목
  final String description; // 결정 카드 설명(이어 묻기=요약 전달)
  final String resumeLabel;
  final String newLabel;
  const ChatEndBoundary({
    super.key,
    required this.onResumeAi,
    required this.onNewQuestion,
    this.message = '직원 상담이 종료되었습니다',
    this.title = '이어서 무엇을 할까요?',
    this.description = '방금 상담을 요약해 AI에게 이어 묻거나, 이전 문맥 없이 새 질문을 시작할 수 있어요.',
    this.resumeLabel = '이어서 AI 질문',
    this.newLabel = '새 질문',
  });

  // 목업 .boundary 구분선 색(#CBD4DA) — 흰 카드/피드에서 은은하게 읽히는 밝은 회색.
  static const _divider = Color(0xFFCBD4DA);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Column(children: [
          // 경계 구분선: 얇은 줄 사이 '직원 상담이 종료되었습니다'(끝난 지점 표시, CHAT-ROOM-END-01).
          Row(children: [
            const Expanded(child: Divider(color: _divider, thickness: 1)),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              child: Text(message,
                  style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      color: AppTokens.grayDone)),
            ),
            const Expanded(child: Divider(color: _divider, thickness: 1)),
          ]),
          const SizedBox(height: 10),
          // 결정 카드: 제목 + 설명 + 두 분기(CHAT-ROOM-END-NAV-01). 완료 티켓 재개 버튼은 없다.
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppTokens.surface,
              borderRadius: BorderRadius.circular(12),
              boxShadow: AppTokens.bubbleShadow,
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title,
                  style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: AppTokens.onSurface)),
              const SizedBox(height: 6),
              Text(description,
                  style: const TextStyle(
                      fontSize: 12, color: AppTokens.grayPending, height: 1.5)),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                        backgroundColor: AppTokens.primary,
                        foregroundColor: Colors.white),
                    onPressed: onResumeAi, // 직전 직원 상담 요약을 가진 새 AI 상담(요약=서버)
                    child: Text(resumeLabel),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(
                    onPressed: onNewQuestion, // 과거 문맥 없는 새 AI 상담
                    child: Text(newLabel),
                  ),
                ),
              ]),
            ]),
          ),
        ]),
      );
}
