import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import '../../widgets/patient_app_bar.dart';
import '../../core/tokens.dart';
import 'chat_repository.dart';
import 'chat_room_view.dart';

/// AI 상담 탭·지난 상담 진입에서 「상담방」을 열기 전에 세션을 확보한다(CHAT-TAB-NAV-01).
/// 서버가 로그인 환자의 활성 세션을 찾거나 없으면 새로 만들어 {thread, aiSession}을 준다.
/// - key=null  : 탭 진입 — 활성 세션 재사용 or 새 상담방.
/// - key=스레드 : 지난 상담 목록에서 그 방 이어보기.
final chatSessionProvider = FutureProvider.family<ChatSessionRef, String?>(
    (ref, threadId) =>
        ref.watch(chatRepositoryProvider).openSession(threadId: threadId));

/// 세션 확보 → 상담방. 로딩·오류(막다른 길 금지: 다시 시도 제공)·방 3상태.
class ChatRoomEntry extends ConsumerWidget {
  /// null이면 탭 진입(활성/새 방), 값이면 그 상담방의 세션을 확보해 이어본다.
  final String? threadId;

  /// 탭(방)일 때만 앱바에 '지난 상담' 아이콘을 붙인다.
  final bool showHistory;

  /// [새 대화]로 연 방(A4). threadId가 있어도 **현재 대화처럼** 연다 — 뒤로가기 없음·'지난 상담' 아이콘 有.
  /// (목록에서 이어본 방과 구분: 그쪽은 뒤로가기로 목록 복귀.)
  final bool primary;

  const ChatRoomEntry(
      {super.key, this.threadId, this.showHistory = false, this.primary = false});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(chatSessionProvider(threadId));
    return s.when(
      loading: () => const Scaffold(
        backgroundColor: AppTokens.background,
        appBar: PatientAppBar(title: 'AI 상담봇', icon: AppIcons.chat_bubble),
        body: Center(child: CircularProgressIndicator()),
      ),
      error: (_, __) => Scaffold(
        backgroundColor: AppTokens.background,
        appBar: const PatientAppBar(title: 'AI 상담봇', icon: AppIcons.chat_bubble),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(AppIcons.cloud_off_outlined,
                  size: 40, color: AppTokens.grayDone),
              const SizedBox(height: 8),
              const Text('상담을 시작하지 못했어요'),
              const SizedBox(height: 4),
              TextButton(
                onPressed: () => ref.invalidate(chatSessionProvider(threadId)),
                child: const Text('다시 시도'),
              ),
            ],
          ),
        ),
      ),
      data: (sref) => ChatRoomView(
        threadId: sref.threadId,
        aiSessionId: sref.aiSessionId,
        // primary(새 대화)는 현재 대화처럼 '지난 상담' 아이콘을 붙인다(A4).
        showHistory: showHistory || primary,
        // 목록에서 이어본 방(threadId 지정·primary 아님)은 뒤로가기로 이전 상담 목록에 복귀한다
        // (CHAT-HISTORY-DEEP-02·NAV-CHATAPP-09). 새 대화(primary)·탭 진입(threadId null)은 뒤로버튼 없음.
        onExit: (threadId == null || primary)
            ? null
            : () => Navigator.of(context).canPop()
                ? context.pop()
                : context.go('/chat/history'),
      ),
    );
  }
}
