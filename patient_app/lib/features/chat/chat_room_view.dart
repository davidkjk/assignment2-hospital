import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../widgets/patient_app_bar.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/tokens.dart';
import 'cards/chat_card_dispatcher.dart';
import 'chat_models.dart';
import 'chat_repository.dart';
import 'chat_room_controller.dart';
import 'chat_room_entry.dart'; // chatSessionProvider(탭 세션) 무효화용
import 'widgets/chat_feed.dart';
import 'widgets/chat_input_bar.dart';
import 'widgets/chat_live_row.dart';
import 'widgets/chat_quick_replies.dart';
import 'widgets/chat_safety_banner.dart';

/// 상담방 셸. 로딩(CHAT-ROOM-LOAD-01)·오류(ERR-01)·빈(EMPTY-01)·피드(FEED-01)를 가르고
/// 안전 배너(SAFE-01)와 입력창(INPUT-01)을 항상 붙인다. 이름은 AI 상담봇(NAME-01).
class ChatRoomView extends ConsumerWidget {
  final String threadId;
  final String aiSessionId;
  final bool showHistory; // AI 상담 탭(방)에서만 '지난 상담' 아이콘을 앱바에 붙인다(NAV-CHATAPP-10)
  final VoidCallback? onFeedback; // 봇 답변 피드백 → 인계(T11)
  // 딥링크 상담방(셸 밖 풀스크린)일 때만 준다. 뒤로가기 = 이전 상담 목록으로(CHAT-HISTORY-DEEP-02·
  // NAV-CHATAPP-09). null이면 탭 진입(하단 탭바가 출구)이라 별도 뒤로 버튼을 두지 않는다.
  final VoidCallback? onExit;
  const ChatRoomView({
    super.key,
    required this.threadId,
    this.aiSessionId = '',
    this.showHistory = false,
    this.onFeedback,
    this.onExit,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final key = (threadId, aiSessionId);
    final st = ref.watch(chatRoomProvider(key));
    final ctl = ref.read(chatRoomProvider(key).notifier);
    return Scaffold(
      backgroundColor: AppTokens.background,
      appBar: PatientAppBar(
        title: 'AI 상담봇', // CHAT-ROOM-NAME-01
        icon: AppIcons.chat_bubble, // 로딩/오류(ChatRoomEntry)와 같은 봇 아이콘 — 전이 시 깜빡임 방지
        // 딥링크 방(onExit != null): 뒤로가기 = 이전 상담 목록(CHAT-HISTORY-DEEP-02·NAV-CHATAPP-09).
        leading: onExit == null
            ? null
            : IconButton(
                icon: const Icon(AppIcons.arrow_back),
                tooltip: '이전 상담 목록',
                onPressed: onExit,
              ),
        actions: [
          // [새 대화](CHAT-ROOM-NEW-01): 활성 세션이 있어도 과거 문맥 없는 새 상담을 시작한다(상시).
          // 기본은 이어가기(30분 재사용)지만, 원할 때 새로 시작할 수 있어야 한다(사용자 결정 B, 2026-09-08).
          IconButton(
            icon: const Icon(AppIcons.edit),
            tooltip: '새 대화',
            onPressed: () async {
              try {
                // Q1·Q2(2026-09-08 실기기): 예전엔 push('/chat/room/:id')라 [새 대화]를 누를 때마다
                // 방이 스택에 쌓이고(뒤로가기 생김), 탭(/chat)은 옛 세션 provider가 캐시돼 있어 다시
                // 눌러도 옛 대화로 갔다. 고침: 새 세션을 만든 뒤 탭 세션 provider를 무효화하고
                // go('/chat')로 이동 — 스택을 쌓지 않고, 탭이 '가장 최근 활성 방'(방금 만든 새 방)을
                // 다시 계산해 보여준다(_resolve_thread tab-entry, patient_ai_session.py).
                await ref.read(chatRepositoryProvider).startFreshSession();
                ref.invalidate(chatSessionProvider(null)); // 탭이 새 방을 다시 잡도록
                if (context.mounted) {
                  context.go('/chat');
                }
              } catch (_) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                      content: Text('새 상담을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.')));
                }
              }
            },
          ),
          if (showHistory)
            IconButton(
              icon: const Icon(AppIcons.history),
              tooltip: '지난 상담',
              onPressed: () => context.go('/chat/history'), // NAV-CHATAPP-10
            ),
        ],
      ),
      // CHAT-ROOM-INPUT-01: 대화 영역(버튼 아닌 곳)을 탭하면 키보드를 내린다 — 갇힘 방지.
      body: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => FocusScope.of(context).unfocus(),
        child: Column(children: [
        const ChatSafetyBanner(), // CHAT-ROOM-SAFE-01 (항상)
        Expanded(child: switch (st.phase) {
          ChatRoomPhase.loading =>
            const Center(child: CircularProgressIndicator()),
          ChatRoomPhase.error => Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(AppIcons.cloud_off_outlined,
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
              // 빈 상태: 안내 + 시작 칩을 **대화창 안**(입력창 위 고정 바 아님)에 둔다. 스크롤 가능.
              ? ListView(
                  key: const Key('chat-empty-guide'),
                  padding: const EdgeInsets.all(24),
                  children: [
                    const SizedBox(height: 24),
                    const Text(
                      '무엇을 도와드릴까요?\n증상이나 궁금한 점을 편하게 남겨 주세요.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: AppTokens.grayPending, height: 1.5),
                    ),
                    const SizedBox(height: 16),
                    Center(child: _buildQuickReplies(st, ctl)),
                  ],
                )
              : ChatFeed(
                  items: st.items,
                  // T12 슬롯 채움: 카드 아이템은 dispatcher가 card_type으로 그린다(CCARD-*).
                  cardBuilder: (ctx, it) => buildChatCard(ctx, it),
                  // T11 슬롯 채움: 직원 말풍선·시스템 이벤트도 같은 피드에(CHAT-ROOM-LIVE-01).
                  liveSlotBuilder: (ctx, it) => ChatLiveRow(item: it),
                  onRetry: (id) => ctl.retry(id),
                  // Q5: 매 봇 말풍선의 상시 [직원에게 물어보기] 버튼은 폐지. 직원 연결은 필요할 때만
                  //     입력창 슬롯의 [직원에게 연결] 칩으로 준다(_buildQuickReplies의 onHandoff, 요구사항 5.5).
                  // A3: 빠른답변 칩을 피드 마지막 줄(말풍선 밑)에 둔다 — 입력창 위 고정 바는 대화창을 가린다.
                  footer: _buildQuickReplies(st, ctl),
                  // Q7: 입력 중 표시를 입력바 위 텍스트가 아니라 피드 안 봇 말풍선 자리(점)로 둔다.
                  // 봇 대기(BOT-TYPING-01)가 우선, 아니면 직원 입력 중(LIVE-TYPING-01). 둘 다 아니면 없음.
                  typingLabel: st.botThinking
                      ? '상담봇이 입력 중'
                      : (st.staffTyping ? '직원이 입력 중입니다' : null),
                ),
        }),
        _inputBar(st, ctl),
      ]),
      ),
    );
  }

  // CHAT-ROOM-INPUT-01 (항상 열림). 빠른답변 칩은 입력창 위 고정 바가 아니라 **피드 마지막 줄**에 둔다
  // (A3, 2026-09-08 실기기: 고정 바가 대화창을 가림). 시작 묶음은 빈 상태 안내 밑, no_answer 칩은 피드 footer.
  Widget _inputBar(ChatRoomState st, ChatRoomController ctl) =>
      ChatInputBar(onSend: (c) => ctl.send(c));

  Widget _buildQuickReplies(ChatRoomState st, ChatRoomController ctl) {
    final active = activeQuickReplies(st.items);
    return ChatQuickReplies(
      replies: st.isEmpty ? startQuickReplies(hasUpcoming: false) : (active?.replies ?? const []),
      onSend: (c) => ctl.send(c),
      handoffLabel: active?.handoffLabel,
      // [직원에게 연결] = 그 문장을 전송 → 백엔드 ⓪-b(check_staff_request)가 즉시 직원 인계로 전환.
      onHandoff: active?.handoffLabel != null ? () => ctl.send(active!.handoffLabel!) : null,
    );
  }
}
