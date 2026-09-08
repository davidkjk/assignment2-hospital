import 'package:flutter/material.dart';
import '../chat_models.dart';
import 'chat_bubble.dart';
import 'chat_typing_indicator.dart';

/// 시간순 한 피드(CHAT-ROOM-FEED-01). 카드는 셸이 그리지 않고 cardBuilder 슬롯으로 넘긴다
/// (T12·T13이 카드 사전을 소유). 라이브/인계 줄은 liveSlotBuilder(T11). 별도 전체화면 없음.
///
/// Q7·Q9(2026-09-08 실기기): 입력 중 표시는 입력바 위 텍스트가 아니라 **피드 안 마지막 줄**의 봇 말풍선
/// 자리(점 애니메이션)로 뜨고(typingLabel), 새 메시지가 오면(내·봇 모두) 그 메시지를 **화면 맨 위로**
/// 스크롤한다(사용자 요구). 새로 들어온 말풍선만 **살짝 등장 애니메이션**을 준다(Q4 — 첫 로드 이력은 정적).
class ChatFeed extends StatefulWidget {
  final List<ChatFeedItem> items;
  final Widget Function(BuildContext, ChatFeedItem)? cardBuilder; // T12·T13
  final Widget Function(BuildContext, ChatFeedItem)? liveSlotBuilder; // T11
  final void Function(String clientMessageId)? onRetry;
  // 빠른답변 칩은 입력창 위(고정 바)가 아니라 **피드 마지막 줄**에 둔다 — 고정 바는 대화창을 가린다는
  // 실기기 지적(2026-09-08). 마지막 말풍선 바로 밑에 칩이 흐름대로 따라오고, 스크롤로 자연히 사라진다.
  final Widget? footer;
  // Q7: 입력 중이면 피드 마지막에 봇 말풍선 자리(점 애니메이션)를 붙인다. null이면 표시 없음.
  //     '상담봇이 입력 중'(봇 대기) / '직원이 입력 중입니다'(직원). 상시 노출 금지(호출부가 조건 판단).
  final String? typingLabel;
  const ChatFeed({
    super.key,
    required this.items,
    this.cardBuilder,
    this.liveSlotBuilder,
    this.onRetry,
    this.footer,
    this.typingLabel,
  });

  // Q20: 내용 없는 말풍선(빈 흰 알약)을 그리지 않는다. 카드·시스템 슬롯으로 가는 것, 실패(재전송 표시
  //   유지), 확인필요(자체 안내)는 제외하고, 그 밖에 본문이 비거나 공백뿐이면 말풍선·피드백 버튼 통째 건너뛴다.
  //   봇 빈 응답의 근본은 백엔드(Q19 = 빈 응답을 503 장애로) 쪽에서 막지만, 실시간 병합 등 어떤 경로로도
  //   빈 말풍선이 새지 않도록 렌더 단계에서 방어한다.
  bool _isBlankBubble(ChatFeedItem it) {
    if (it.messageType == 'card' && cardBuilder != null) return false;
    if (it.messageType == 'system' && liveSlotBuilder != null) return false;
    if (it.isUnknown) return false;
    if (it.sendState == ChatSendState.failed) return false;
    return (it.content?.trim().isEmpty ?? true);
  }

  @override
  State<ChatFeed> createState() => _ChatFeedState();
}

class _ChatFeedState extends State<ChatFeed> {
  final ScrollController _scroll = ScrollController();
  // 마지막 메시지 줄에 붙여 "새 메시지를 화면 맨 위로"(Q9) 스크롤 대상으로 삼는다.
  final GlobalKey _lastMsgKey = GlobalKey();
  // 입력 중 말풍선 줄 — 새 메시지 없이 입력 중만 뜰 때 보이도록 스크롤 대상.
  final GlobalKey _typingKey = GlobalKey();
  // 첫 로드(복원 이력) id — 이 묶음은 등장 애니메이션 없이 정적으로 그린다. 이후 들어온 것만 애니메이션(Q4).
  late final Set<String> _initialIds = {for (final it in widget.items) it.id};

  // Q20: 빈 말풍선(빈 흰 알약)을 렌더 전에 걸러 낸다. 스크롤·isLast 판정도 이 목록을 기준으로 삼아,
  //   마지막이 빈 말풍선이어도 실제로 그려지는 마지막 줄로 스크롤되게 한다.
  static List<ChatFeedItem> _visible(ChatFeed w) =>
      [for (final it in w.items) if (!w._isBlankBubble(it)) it];

  String? get _lastId {
    final v = _visible(widget);
    return v.isNotEmpty ? v.last.id : null;
  }

  @override
  void didUpdateWidget(covariant ChatFeed old) {
    super.didUpdateWidget(old);
    final oldV = _visible(old);
    final oldLast = oldV.isNotEmpty ? oldV.last.id : null;
    if (_lastId != null && _lastId != oldLast) {
      // 새 메시지(내·봇) — 그 메시지를 화면 맨 위로(사용자 요구: "새 내용을 화면 맨 위로 스크롤").
      _scrollToTarget(_lastMsgKey, alignment: 0.0);
    } else if (widget.typingLabel != null && old.typingLabel == null) {
      // 새 메시지 없이 입력 중만 시작 — 점 말풍선이 가려지지 않게 아래 끝으로 보인다.
      _scrollToTarget(_typingKey, alignment: 1.0);
    }
  }

  void _scrollToTarget(GlobalKey key, {required double alignment}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final ctx = key.currentContext;
      if (ctx == null || !mounted) return;
      Scrollable.ensureVisible(
        ctx,
        alignment: alignment, // 0.0=대상 위쪽을 뷰포트 위로, 1.0=아래쪽을 뷰포트 아래로
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOutCubic,
      );
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final items = _visible(widget); // Q20: 빈 말풍선 제외한 실제 렌더 목록
    final hasFooter = widget.footer != null;
    final hasTyping = widget.typingLabel != null;
    final count = items.length + (hasFooter ? 1 : 0) + (hasTyping ? 1 : 0);
    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: count,
      itemBuilder: (ctx, i) {
        // 순서: [메시지들] → footer(빠른답변 칩) → 입력 중 말풍선(가장 아래).
        if (hasTyping && i == count - 1) {
          return KeyedSubtree(
            key: _typingKey,
            child: ChatTypingBubble(label: widget.typingLabel!),
          );
        }
        if (hasFooter && i == items.length) {
          return Padding(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 8), child: widget.footer!);
        }
        final it = items[i];
        final isLast = i == items.length - 1;
        Widget row;
        if (it.messageType == 'card' && widget.cardBuilder != null) {
          row = widget.cardBuilder!(ctx, it);
        } else if (it.messageType == 'system' && widget.liveSlotBuilder != null) {
          row = widget.liveSlotBuilder!(ctx, it);
        } else {
          // CHAT-ROOM-FEED-01: 발신자별 좌우 정렬. ChatBubble 내부 end 정렬은 열이 내용폭으로 줄어
          // 무효라, 여기서 Align으로 감싸 내 메시지=오른쪽, 봇·직원=왼쪽에 붙인다.
          final isPatient = it.senderType == 'patient';
          row = Align(
            key: ValueKey('msg-align-${it.id}'),
            alignment: isPatient ? Alignment.centerRight : Alignment.centerLeft,
            child: Column(
              crossAxisAlignment:
                  isPatient ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
                // CHAT-ROOM-FEEDBACK-01/Q5: 매 봇 말풍선마다 붙던 상시 [직원에게 물어보기] 버튼을 폐지했다
                // (2026-09-08 실기기). 직원 연결은 필요할 때만 입력창 슬롯의 [직원에게 연결] 칩으로.
                ChatBubble(
                  item: it,
                  onRetry: it.clientMessageId == null
                      ? null
                      : () => widget.onRetry?.call(it.clientMessageId!),
                ),
              ],
            ),
          );
        }
        // Q4: 첫 로드 이력이 아닌, 새로 들어온 줄만 살짝 등장 애니메이션(id로 판별 — 정적 이력은 그대로).
        if (!_initialIds.contains(it.id)) {
          row = _EntranceAnim(key: ValueKey('enter-${it.id}'), child: row);
        }
        // 마지막 메시지엔 "화면 맨 위로"(Q9) 스크롤 대상 키를 씌운다.
        if (isLast) row = KeyedSubtree(key: _lastMsgKey, child: row);
        return row;
      },
    );
  }
}

/// 말풍선 등장 — 아주 짧게 페이드 + 살짝 위로(Q4 "등장 애니메이션 약간"). 한 번만 재생(State 유지).
/// 모션 최소화 설정이면 즉시 표시한다(접근성).
class _EntranceAnim extends StatefulWidget {
  const _EntranceAnim({super.key, required this.child});
  final Widget child;
  @override
  State<_EntranceAnim> createState() => _EntranceAnimState();
}

class _EntranceAnimState extends State<_EntranceAnim>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 240));
  late final Animation<double> _fade =
      CurvedAnimation(parent: _c, curve: Curves.easeOut);
  late final Animation<Offset> _slide = Tween<Offset>(
    begin: const Offset(0, 0.06),
    end: Offset.zero,
  ).animate(CurvedAnimation(parent: _c, curve: Curves.easeOutCubic));

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (MediaQuery.maybeOf(context)?.disableAnimations ?? false) {
        _c.value = 1.0; // 모션 최소화 — 즉시 표시
      } else {
        _c.forward();
      }
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
        opacity: _fade,
        child: SlideTransition(position: _slide, child: widget.child),
      );
}
