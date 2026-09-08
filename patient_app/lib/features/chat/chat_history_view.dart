import 'package:flutter/material.dart';
import '../../widgets/patient_app_bar.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/tokens.dart';
import 'chat_models.dart';
import 'chat_repository.dart';

/// 이전 상담 목록(CHAT-HISTORY-*). 로딩(LOAD)·0건(EMPTY)·오류(ERR)·목록(LIST)·복원(RESTORE)·삭제(DELETE).
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

class ChatHistoryView extends ConsumerStatefulWidget {
  final void Function(String threadId)? onOpen;

  /// 지난 상담 삭제(CHAT-HISTORY-DELETE-01). 확인창 뒤에만 호출된다. 성공=true.
  /// 기본(null)은 repo.deleteThread로 서버에 실제 삭제 요청. 테스트는 가짜를 주입한다.
  final Future<bool> Function(String threadId)? onDelete;

  const ChatHistoryView({super.key, this.onOpen, this.onDelete});

  @override
  ConsumerState<ChatHistoryView> createState() => _ChatHistoryViewState();
}

class _ChatHistoryViewState extends ConsumerState<ChatHistoryView> {
  // 삭제한(또는 진행 중) 방은 즉시 목록에서 감춘다 — FutureProvider 스냅샷은 불변이라 로컬로 관리.
  final Set<String> _hidden = <String>{};

  /// 되돌릴 수 없는 삭제 — 빨간 확인창 뒤에만 실제 삭제(CLAUDE.md: 되돌릴 수 없는 동작은 확인창 안에서만).
  Future<bool> _confirmAndDelete(String threadId, String label) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('상담을 삭제할까요?'),
        content: Text('‘$label’ 상담 기록이 완전히 삭제됩니다. 되돌릴 수 없습니다.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('취소')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              style: TextButton.styleFrom(foregroundColor: AppTokens.warn),
              child: const Text('삭제')),
        ],
      ),
    );
    if (ok != true) return false;
    try {
      final deleter = widget.onDelete ??
          (id) async {
            await ref.read(chatRepositoryProvider).deleteThread(id);
            return true;
          };
      return await deleter(threadId);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('삭제하지 못했어요. 잠시 후 다시 시도해 주세요.')));
      }
      return false; // 실패하면 행을 남긴다(막다른 길 방지).
    }
  }

  @override
  Widget build(BuildContext context) {
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
        data: (all) {
          final list = all.where((s) => !_hidden.contains(s.threadId)).toList();
          if (list.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  '첫 상담을 시작해 보세요.\n증상이나 병원 이용이 궁금할 때 도와드립니다.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppTokens.grayPending, height: 1.5),
                ),
              ),
            ); // EMPTY
          }
          return ListView.separated(
            itemCount: list.length,
            separatorBuilder: (_, __) =>
                const Divider(height: 1, color: AppTokens.border),
            itemBuilder: (_, i) {
              final s = list[i];
              // CHAT-HISTORY-LIST-01: 식별 가능한 행 — 마지막 대화 요약(제목) + 날짜(부제).
              final date = _fmtDate(s.lastAt);
              final label = s.lastSnippet ?? 'AI 상담';
              // CHAT-HISTORY-DELETE-01: 왼쪽으로 스와이프하면 확인창 뒤 진짜 삭제(되돌릴 수 없음).
              return Dismissible(
                key: ValueKey('thread-${s.threadId}'),
                direction: DismissDirection.endToStart,
                background: Container(
                  color: AppTokens.warn,
                  alignment: Alignment.centerRight,
                  padding: const EdgeInsets.only(right: 20),
                  child: const Icon(Icons.delete_outline, color: Colors.white),
                ),
                confirmDismiss: (_) => _confirmAndDelete(s.threadId, label),
                onDismissed: (_) {
                  setState(() => _hidden.add(s.threadId));
                  ref.invalidate(chatHistoryProvider); // 서버 진실로 재동기화(감춤은 유지)
                },
                child: ListTile(
                  leading: const Icon(AppIcons.chat_bubble_outline,
                      color: AppTokens.primary),
                  title: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
                  subtitle: date.isEmpty
                      ? null
                      : Text(date,
                          style: const TextStyle(
                              color: AppTokens.grayPending, fontSize: 12.5)),
                  trailing: const Icon(AppIcons.chevron_right, color: AppTokens.grayDone),
                  onTap: () => widget.onOpen?.call(s.threadId), // RESTORE
                ),
              );
            },
          ); // LIST
        },
      ),
    );
  }
}
