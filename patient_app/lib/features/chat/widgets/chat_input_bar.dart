import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import '../../../core/tokens.dart';

/// 자유 입력창은 항상 열려 있다(CHAT-ROOM-INPUT-01). 빠른답변은 위 슬롯으로만 얹고
/// 입력을 대체하지 않는다 — 빠른답변만 쓰도록 강제하지 않는다.
class ChatInputBar extends StatefulWidget {
  final void Function(String content) onSend;
  final Widget? quickRepliesSlot; // T12가 CCARD-QUICK을 채운다
  /// [CHAT-ROOM-PATIENT-TYPING-01] 글자가 바뀔 때마다 부른다 — 환자 "입력 중"을 직원에게 알린다(디바운스는 컨트롤러).
  final void Function(String content)? onChanged;
  const ChatInputBar(
      {super.key, required this.onSend, this.quickRepliesSlot, this.onChanged});
  @override
  State<ChatInputBar> createState() => _ChatInputBarState();
}

class _ChatInputBarState extends State<ChatInputBar> {
  final _c = TextEditingController();

  void _submit() {
    if (_c.text.trim().isEmpty) return;
    widget.onSend(_c.text.trim());
    _c.clear();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Container(
        decoration: const BoxDecoration(
          color: AppTokens.surface,
          border: Border(top: BorderSide(color: AppTokens.border)),
        ),
        padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          if (widget.quickRepliesSlot != null) widget.quickRepliesSlot!,
          Row(children: [
            Expanded(
              child: TextField(
                controller: _c,
                textInputAction: TextInputAction.send,
                onChanged: widget.onChanged,
                onSubmitted: (_) => _submit(),
                decoration: InputDecoration(
                  hintText: '메시지를 입력하세요',
                  isDense: true,
                  filled: true,
                  fillColor: AppTokens.muted,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(20),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                ),
              ),
            ),
            IconButton(
              icon: const Icon(AppIcons.send, color: AppTokens.primary),
              onPressed: _submit,
            ),
          ]),
        ]),
      );
}
