import 'package:flutter/material.dart';
import '../../core/tokens.dart';

/// AI 장애 화면(CHAT-OUTAGE-*). 장애 알림(SHOW)·비AI 문의(INQUIRY/BUSY/ERR/DONE)·
/// 예약 우회(BOOK)·전화 우회(PHONE). 복구는 [다시 시도]의 성공으로만 확인한다
/// (CHAT-OUTAGE-RECOVER-01 확정 — 배경 폴링·자동 재전송 없음).
enum OutageInquiryPhase { idle, busy, error, done }

class ChatOutageView extends StatefulWidget {
  final OutageInquiryPhase phase;
  final String hospitalPhone;
  final VoidCallback onBook;
  final VoidCallback onRetry;
  final void Function(String content) onInquiry;
  const ChatOutageView({
    super.key,
    required this.phase,
    required this.hospitalPhone,
    required this.onBook,
    required this.onRetry,
    required this.onInquiry,
  });

  @override
  State<ChatOutageView> createState() => _ChatOutageViewState();
}

class _ChatOutageViewState extends State<ChatOutageView> {
  final _c = TextEditingController();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final busy = widget.phase == OutageInquiryPhase.busy;
    return Scaffold(
      backgroundColor: AppTokens.background,
      appBar: AppBar(title: const Text('AI 상담봇')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        // SHOW: 정상 답변/0건 위장 없이 장애 상태를 알린다.
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppTokens.offlineBannerBg,
            borderRadius: BorderRadius.circular(10),
            border: const Border(
                left: BorderSide(color: AppTokens.warn, width: AppTokens.warnBarWidth)),
          ),
          child: const Text('AI 상담이 일시적으로 어려워요',
              style: TextStyle(
                  fontSize: AppTokens.bodyFontSize,
                  fontWeight: FontWeight.w600,
                  color: AppTokens.onSurface)),
        ),
        const SizedBox(height: 16),
        // BOOK: 예약은 앱에서 바로.
        const Text('예약은 앱에서 바로 하실 수 있습니다',
            style: TextStyle(color: AppTokens.onSurface)),
        const SizedBox(height: 6),
        OutlinedButton(onPressed: widget.onBook, child: const Text('예약하기')),
        const SizedBox(height: 8),
        // PHONE: 병원 전화 함께.
        Text('병원 전화: ${widget.hospitalPhone}',
            style: const TextStyle(color: AppTokens.grayPending)),
        const Divider(height: 28),
        if (widget.phase == OutageInquiryPhase.done)
          // DONE: 남겨졌음 + 직원 답변 경로 유지.
          const Text('문의가 남겨졌습니다. 직원이 확인 후 답변드립니다',
              style: TextStyle(color: AppTokens.onSurface))
        else ...[
          const Text('문의 남기기',
              style: TextStyle(fontWeight: FontWeight.w600, color: AppTokens.onSurface)),
          const SizedBox(height: 6),
          // INQUIRY: AI를 거치지 않는 문의 작성. busy면 입력 보존한 채 잠근다.
          TextField(
            controller: _c,
            enabled: !busy,
            minLines: 2,
            maxLines: 4,
            decoration: InputDecoration(
              hintText: '궁금한 점을 남겨 주세요',
              filled: true,
              fillColor: AppTokens.muted,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          if (busy)
            const Padding(
              padding: EdgeInsets.only(top: 6),
              child: Text('문의를 남기는 중입니다',
                  style: TextStyle(fontSize: 12, color: AppTokens.grayPending)),
            ),
          if (widget.phase == OutageInquiryPhase.error)
            // ERR: 완료로 바꾸지 않고 오류 + 재시도.
            Row(children: [
              const Icon(Icons.error_outline, size: 14, color: AppTokens.warn),
              const SizedBox(width: 4),
              const Text('문의를 남기지 못했어요',
                  style: TextStyle(fontSize: 12, color: AppTokens.warn)),
              const Spacer(),
              TextButton(onPressed: widget.onRetry, child: const Text('다시 시도')),
            ]),
          const SizedBox(height: 6),
          FilledButton(
            key: const Key('outage-submit'),
            onPressed: busy ? null : () => widget.onInquiry(_c.text.trim()), // BUSY 잠금
            child: const Text('문의 남기기'),
          ),
        ],
        const SizedBox(height: 16),
        // RECOVER: 사용자 행동의 성공으로만 복구 확인(자동 전환·재전송 없음).
        TextButton(
          key: const Key('outage-retry'),
          onPressed: widget.onRetry,
          child: const Text('AI 상담 다시 시도'),
        ),
      ]),
    );
  }
}
