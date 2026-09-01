import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/tokens.dart';
import 'chat_models.dart';
import 'chat_room_controller.dart';
import 'widgets/chat_feed.dart';
import 'widgets/chat_input_bar.dart';
import 'widgets/chat_safety_banner.dart';

/// 상담방 셸. 로딩(CHAT-ROOM-LOAD-01)·오류(ERR-01)·빈(EMPTY-01)·피드(FEED-01)를 가르고
/// 안전 배너(SAFE-01)와 입력창(INPUT-01)을 항상 붙인다. 이름은 AI 상담봇(NAME-01).
class ChatRoomView extends ConsumerWidget {
  final String threadId;
  final VoidCallback? onFeedback; // 봇 답변 피드백 → 인계(T11)
  const ChatRoomView({super.key, required this.threadId, this.onFeedback});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final st = ref.watch(chatRoomProvider(threadId));
    final ctl = ref.read(chatRoomProvider(threadId).notifier);
    return Scaffold(
      backgroundColor: AppTokens.background,
      appBar: AppBar(title: const Text('AI 상담봇')), // CHAT-ROOM-NAME-01
      body: Column(children: [
        const ChatSafetyBanner(), // CHAT-ROOM-SAFE-01 (항상)
        Expanded(child: switch (st.phase) {
          ChatRoomPhase.loading =>
            const Center(child: CircularProgressIndicator()),
          ChatRoomPhase.error => Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.cloud_off_outlined,
                      size: 40, color: AppTokens.grayDone),
                  const SizedBox(height: 8),
                  const Text('대화를 불러오지 못했어요'),
                  const SizedBox(height: 4),
                  TextButton(
                      onPressed: () => ctl.load(),
                      child: const Text('다시 시도')),
                ],
              ),
            ),
          ChatRoomPhase.loaded => st.isEmpty
              ? const Center(
                  key: Key('chat-empty-guide'),
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: Text(
                      '무엇을 도와드릴까요?\n증상이나 궁금한 점을 편하게 남겨 주세요.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: AppTokens.grayPending, height: 1.5),
                    ),
                  ),
                )
              : ChatFeed(
                  items: st.items,
                  onRetry: (id) => ctl.retry(id),
                  onFeedback: (_) => onFeedback?.call(),
                ),
        }),
        ChatInputBar(onSend: (c) => ctl.send(c)), // CHAT-ROOM-INPUT-01 (항상 열림)
      ]),
    );
  }
}
