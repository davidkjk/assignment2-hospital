import 'package:flutter/material.dart';
import '../../widgets/patient_app_bar.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/tokens.dart';
import 'chat_models.dart';
import 'chat_repository.dart';

/// 이전 상담 목록(CHAT-HISTORY-*). 로딩(LOAD)·0건(EMPTY)·오류(ERR)·목록(LIST)·복원(RESTORE).
final chatHistoryProvider = FutureProvider<List<ChatThreadSummary>>(
    (ref) => ref.watch(chatRepositoryProvider).fetchThreads());

/// 목록 행의 날짜(last_at, UTC)를 로컬 기준 한국어로. 오늘/어제는 상대, 그 외는 'M월 D일'.
String _fmtDate(DateTime? at) {
  if (at == null) return '';
  final d = at.toLocal();
  final now = DateTime.now();
  final ampm = d.hour < 12 ? '오전' : '오후';
  final h12 = d.hour % 12 == 0 ? 12 : d.hour % 12;
  final time = '$ampm $h12:${d.minute.toString().padLeft(2, '0')}';
  bool sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
  if (sameDay(d, now)) return '오늘 $time';
  if (sameDay(d, now.subtract(const Duration(days: 1)))) return '어제 $time';
  return '${d.month}월 ${d.day}일 $time';
}

class ChatHistoryView extends ConsumerWidget {
  final void Function(String threadId)? onOpen;
  const ChatHistoryView({super.key, this.onOpen});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final v = ref.watch(chatHistoryProvider);
    return Scaffold(
      backgroundColor: AppTokens.background,
      appBar: const PatientAppBar(title: 'AI 상담', icon: AppIcons.chat_bubble), // #36: 탭 헤더 아이콘(하단 탭과 동일)
      body: v.when(
        loading: () => const Center(child: CircularProgressIndicator()), // LOAD
        error: (_, __) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(AppIcons.cloud_off_outlined, size: 40, color: AppTokens.grayDone),
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
                  // CHAT-HISTORY-LIST-01: 식별 가능한 행 — 마지막 대화 요약(제목) + 날짜(부제).
                  // 요약이 비면(마지막이 카드·시스템) 'AI 상담'으로 폴백하되, 날짜로 행을 구분한다.
                  final date = _fmtDate(s.lastAt);
                  return ListTile(
                    leading: const Icon(AppIcons.chat_bubble_outline,
                        color: AppTokens.primary),
                    title: Text(s.lastSnippet ?? 'AI 상담',
                        maxLines: 1, overflow: TextOverflow.ellipsis),
                    subtitle: date.isEmpty
                        ? null
                        : Text(date,
                            style: const TextStyle(
                                color: AppTokens.grayPending, fontSize: 12.5)),
                    trailing: const Icon(AppIcons.chevron_right, color: AppTokens.grayDone),
                    onTap: () => onOpen?.call(s.threadId), // RESTORE
                  );
                },
              ), // LIST
      ),
    );
  }
}
