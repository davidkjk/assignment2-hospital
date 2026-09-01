import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/tokens.dart';
import 'chat_models.dart';
import 'chat_repository.dart';

/// 이전 상담 목록(CHAT-HISTORY-*). 로딩(LOAD)·0건(EMPTY)·오류(ERR)·목록(LIST)·복원(RESTORE).
final chatHistoryProvider = FutureProvider<List<ChatThreadSummary>>(
    (ref) => ref.watch(chatRepositoryProvider).fetchThreads());

class ChatHistoryView extends ConsumerWidget {
  final void Function(String threadId)? onOpen;
  const ChatHistoryView({super.key, this.onOpen});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final v = ref.watch(chatHistoryProvider);
    return Scaffold(
      backgroundColor: AppTokens.background,
      appBar: AppBar(title: const Text('AI 상담')),
      body: v.when(
        loading: () => const Center(child: CircularProgressIndicator()), // LOAD
        error: (_, __) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_outlined, size: 40, color: AppTokens.grayDone),
              const SizedBox(height: 8),
              const Text('상담 목록을 불러오지 못했어요'),
              const SizedBox(height: 4),
              TextButton(
                onPressed: () => ref.invalidate(chatHistoryProvider),
                child: const Text('다시 시도'),
              ),
            ],
          ),
        ), // ERR
        data: (list) => list.isEmpty
            ? const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Text(
                    '첫 상담을 시작해 보세요.\n증상이나 병원 이용이 궁금할 때 도와드립니다.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AppTokens.grayPending, height: 1.5),
                  ),
                ),
              ) // EMPTY
            : ListView.separated(
                itemCount: list.length,
                separatorBuilder: (_, __) =>
                    const Divider(height: 1, color: AppTokens.border),
                itemBuilder: (_, i) {
                  final s = list[i];
                  return ListTile(
                    leading: const Icon(Icons.chat_bubble_outline,
                        color: AppTokens.primary),
                    title: Text(s.lastSnippet ?? '상담',
                        maxLines: 1, overflow: TextOverflow.ellipsis),
                    trailing: const Icon(Icons.chevron_right, color: AppTokens.grayDone),
                    onTap: () => onOpen?.call(s.threadId), // RESTORE
                  );
                },
              ), // LIST
      ),
    );
  }
}
