import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../core/tokens.dart';

/// 데모 정본 입력칸: 굵은 라벨을 칸 '위'에 두고, 칸 안엔 안내글(placeholder)만 둔다.
/// (Material 기본 floating label과 다르다.) 눈 토글·키보드·포매터를 그대로 넘긴다.
/// 테스트가 칸을 Key로 찾으므로 [fieldKey]를 TextField에 그대로 붙인다.
class LabeledField extends StatelessWidget {
  const LabeledField({
    super.key,
    required this.label,
    required this.controller,
    this.fieldKey,
    this.hint,
    this.obscureText = false,
    this.suffixIcon,
    this.keyboardType,
    this.inputFormatters,
    this.textStyle,
    this.onChanged,
    this.focusNode,
    this.trailingLabel,
  });

  final String label;
  final TextEditingController controller;
  final Key? fieldKey;
  final String? hint;
  final bool obscureText;
  final Widget? suffixIcon;
  final TextInputType? keyboardType;
  final List<TextInputFormatter>? inputFormatters;
  final TextStyle? textStyle;
  final ValueChanged<String>? onChanged;
  final FocusNode? focusNode;

  /// 라벨 오른쪽에 덧붙는 회색 설명(예: 성별 「(문진 문항 노출에 쓰입니다)」).
  final Widget? trailingLabel;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Text(label,
              style: const TextStyle(
                  fontSize: 14, fontWeight: FontWeight.w600, color: AppTokens.onSurface)),
          if (trailingLabel != null) ...[const SizedBox(width: 6), trailingLabel!],
        ]),
        const SizedBox(height: 8),
        TextField(
          key: fieldKey,
          controller: controller,
          focusNode: focusNode,
          obscureText: obscureText,
          keyboardType: keyboardType,
          inputFormatters: inputFormatters,
          style: textStyle ?? const TextStyle(fontSize: 16, color: AppTokens.onSurface),
          onChanged: onChanged,
          decoration: InputDecoration(
            hintText: hint,
            suffixIcon: suffixIcon,
          ),
        ),
      ],
    );
  }
}
