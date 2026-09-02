import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/tokens.dart';
import '../booking_controller.dart';

// 6단계 — 방문 이유(BOOK-WHY-*). 자유 입력 100자, 필수 아님(건너뛰기), 문진 초기값 안내 상자.
class WhyStep extends ConsumerStatefulWidget {
  const WhyStep({super.key});
  @override
  ConsumerState<WhyStep> createState() => _WhyStepState();
}

class _WhyStepState extends ConsumerState<WhyStep> {
  final _ctl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _ctl.text = ref.read(bookingProvider).reason ?? ''; // 뒤로 왔다 다시 오면 값 보존
    _ctl.addListener(() => setState(() {})); // 글자 수 갱신
  }

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final notifier = ref.read(bookingProvider.notifier);
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('어떤 일로 오시나요?', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)), // BOOK-WHY-02
        const SizedBox(height: 4),
        const Text('간단히 적어주시면 진료 준비에 도움이 됩니다.',
            style: TextStyle(fontSize: 14, color: AppTokens.grayPending)),
        const SizedBox(height: 16),
        TextField(
          controller: _ctl,
          maxLength: 100, // BOOK-WHY-01·05 자유입력 100자, 넘으면 입력 자체 막힘
          minLines: 4, // 데모 min-h-28(112) — 넉넉한 textarea
          maxLines: 6,
          style: const TextStyle(fontSize: 14),
          inputFormatters: [LengthLimitingTextInputFormatter(100)],
          decoration: InputDecoration(
            hintText: '예: 3일 전부터 기침과 콧물이 있어요',
            counterText: '',
            // 데모 textarea rounded-xl(14)
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppTokens.border),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppTokens.border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppTokens.primary, width: 1.6),
            ),
          ),
        ),
        Align(
          alignment: Alignment.centerRight,
          child: Text('${_ctl.text.characters.length}/100', // BOOK-WHY-05 남은 글자 수
              style: const TextStyle(fontSize: 12, color: AppTokens.grayPending)),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppTokens.primary.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(14), // 데모 rounded-xl
          ),
          child: const Text(
            '여기 적으신 내용은 나중에 작성하실 사전문진의 첫 문항에 그대로 옮겨져 있습니다. '
            '거기서 더 자세히 고쳐 쓰실 수 있습니다.', // BOOK-WHY-04 안내 상자
            style: TextStyle(fontSize: 12, color: AppTokens.grayPending),
          ),
        ),
        const Spacer(),
        Row(children: [
          Expanded(
            child: OutlinedButton(
              onPressed: () => notifier.setReason(''), // BOOK-WHY-03 건너뛰기(필수 아님)
              child: const Text('건너뛰기'),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: FilledButton(
              onPressed: () => notifier.setReason(_ctl.text),
              child: const Text('다음'),
            ),
          ),
        ]),
      ]),
    );
  }
}
