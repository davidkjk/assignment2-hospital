import 'package:flutter/material.dart';
import '../core/tokens.dart';

/// 폼 전체의 검사 시점을 조율한다. 각 FieldTextInput이 스스로 등록/해제한다.
class FieldErrorController {
  final List<_FieldHandle> _fields = [];
  void _register(_FieldHandle h) => _fields.add(h);
  void _unregister(_FieldHandle h) => _fields.remove(h);

  /// 버튼을 누를 때 전체를 다시 검사한다(ERR-FLD-04) — 건드리지 않은 칸도 이때 걸린다.
  /// 오류가 여럿이면 화면에 배치된 순서상 첫 오류 칸으로 자동 스크롤한다(ERR-FLD-05).
  /// 모두 통과면 true.
  bool validateAll() {
    _FieldHandle? firstBad;
    for (final f in _fields) {
      if (!f.validate()) firstBad ??= f;
    }
    firstBad?.ensureVisible();
    return firstBad == null;
  }
}

class _FieldHandle {
  final bool Function() validate;      // 오류면 표시하고 false 반환
  final void Function() ensureVisible; // 자기 위치로 스크롤
  _FieldHandle(this.validate, this.ensureVisible);
}

class FieldTextInput extends StatefulWidget {
  final String label;
  final TextEditingController controller;
  final FieldErrorController form;
  final String? Function(String value) validate; // null=통과, 문자열=칸 아래 오류 문구
  const FieldTextInput({
    super.key,
    required this.label,
    required this.controller,
    required this.form,
    required this.validate,
  });

  @override
  State<FieldTextInput> createState() => _FieldTextInputState();
}

class _FieldTextInputState extends State<FieldTextInput> {
  final FocusNode _node = FocusNode();
  late final _FieldHandle _handle;
  String? _error;

  @override
  void initState() {
    super.initState();
    _handle = _FieldHandle(_runValidate, _scrollToSelf);
    widget.form._register(_handle);
    // ERR-FLD-03: 그 칸을 떠날 때(포커스를 잃을 때) 검사한다.
    _node.addListener(() {
      if (!_node.hasFocus) _runValidate();
    });
  }

  @override
  void dispose() {
    widget.form._unregister(_handle);
    _node.dispose();
    super.dispose();
  }

  bool _runValidate() {
    final msg = widget.validate(widget.controller.text);
    if (mounted) setState(() => _error = msg);
    return msg == null;
  }

  void _scrollToSelf() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        Scrollable.ensureVisible(context,
            duration: const Duration(milliseconds: 200), alignment: 0.5);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 데모 정본: 라벨은 칸 위(굵게), 칸 안엔 안내글만.
        Text(widget.label,
            style: const TextStyle(
                fontSize: 14, fontWeight: FontWeight.w600, color: AppTokens.onSurface)),
        const SizedBox(height: 8),
        TextField(
          controller: widget.controller,
          focusNode: _node,
          keyboardType: TextInputType.phone,
          style: const TextStyle(fontSize: 16, color: AppTokens.onSurface),
          decoration: const InputDecoration(hintText: '010-1234-5678'),
          // ERR-FLD-02: 타이핑 도중에는 (처음) 검사하지 않는다. 단 이미 떠 있는 오류는 입력을
          // 건드리는 즉시 지운다(ERR-GONE-01) — 맞게 고치고 있는 사람을 계속 나무라지 않는다.
          onChanged: (_) {
            if (_error != null) setState(() => _error = null);
          },
        ),
        if (_error != null) // ERR-FLD-01: 틀린 칸 바로 아래에, 칸마다 따로 붙는다
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 4),
            child: Text(_error!,
                style: const TextStyle(color: AppTokens.warn, fontSize: 13)),
          ),
      ],
    );
  }
}
