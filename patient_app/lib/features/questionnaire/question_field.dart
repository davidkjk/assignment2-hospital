import 'package:flutter/material.dart';
import 'questionnaire_repository.dart';

/// 문항 하나를 그 type에 맞게 그린다(QNR-TYPE). 값은 부모(마법사)가 들고 onChanged로 올려받는다.
///
/// 실행 보정: 플랜은 build마다 새 TextEditingController를 만들었으나(커서가 매 타자마다 끝으로
/// 튀고 컨트롤러가 누수됨) — 문진은 장문 입력이 많아 실제 문제다. 컨트롤러를 State가 들고,
/// 문항이 바뀔 때만(didUpdateWidget) 값을 다시 싣는다.
class QuestionField extends StatefulWidget {
  const QuestionField({super.key, required this.question, required this.value, required this.onChanged});
  final Question question;
  final String? value;
  final ValueChanged<String> onChanged;

  @override
  State<QuestionField> createState() => _QuestionFieldState();
}

class _QuestionFieldState extends State<QuestionField> {
  late final TextEditingController _controller = TextEditingController(text: widget.value ?? '');

  @override
  void didUpdateWidget(QuestionField old) {
    super.didUpdateWidget(old);
    // 다른 문항으로 넘어왔으면(문항 번호가 바뀜) 그 문항의 저장된 답으로 갈아 끼운다.
    // 같은 문항에서 값 echo(내가 방금 친 글자)는 무시 — 커서가 튀지 않게.
    if (old.question.id != widget.question.id) {
      _controller.text = widget.value ?? '';
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    switch (widget.question.type) {
      case '예/아니오':
        return Row(children: [
          _yesNo(context, '예'),
          const SizedBox(width: 12),
          _yesNo(context, '아니오'),
        ]);
      case '장문형':
        return TextField(
          controller: _controller,
          maxLines: 5,
          minLines: 3,
          onChanged: widget.onChanged,
          decoration: const InputDecoration(
              filled: true, fillColor: Colors.white, border: OutlineInputBorder()),
        );
      case '단답형':
      default:
        return TextField(
          controller: _controller,
          maxLines: 1,
          onChanged: widget.onChanged,
          decoration: const InputDecoration(
              filled: true, fillColor: Colors.white, border: OutlineInputBorder()),
        );
    }
  }

  Widget _yesNo(BuildContext context, String label) {
    final selected = widget.value == label;
    const shape = RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(16)));
    return Expanded(
      child: SizedBox(
        height: 88, // 큰 버튼 2개(QNR-TYPE-03) — 한 화면에 한 문항이라 크게
        child: selected
            ? FilledButton(
                key: Key('yesno-selected-$label'),
                style: FilledButton.styleFrom(shape: shape),
                onPressed: () => widget.onChanged(label),
                child: Text(label, style: const TextStyle(fontSize: 20)))
            : OutlinedButton(
                style: OutlinedButton.styleFrom(shape: shape),
                onPressed: () => widget.onChanged(label),
                child: Text(label, style: const TextStyle(fontSize: 20))),
      ),
    );
  }
}
