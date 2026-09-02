import 'package:flutter/material.dart';

import '../../core/button_sizes.dart';
import '../../core/tokens.dart';

/// FAM-EDIT-12 관계 4종(데모 relationOptions)과 같은 목록.
const familyRelationOptions = ['아들', '딸', '배우자', '부모'];

/// 휴대폰 번호 형식(하이픈 있어도 됨). 011/016/017/018/019도 허용한다.
bool familyPhoneValid(String raw) {
  final digits = raw.replaceAll(RegExp(r'[^0-9]'), '');
  return RegExp(r'^01[016789]\d{7,8}$').hasMatch(digits);
}

/// yyyy-MM-dd 텍스트를 DateTime으로. 형식이 아니거나 실제 없는 날짜면 null.
DateTime? parseFamilyBirth(String raw) {
  final m = RegExp(r'^(\d{4})-(\d{1,2})-(\d{1,2})$').firstMatch(raw.trim());
  if (m == null) return null;
  final y = int.parse(m.group(1)!), mo = int.parse(m.group(2)!), d = int.parse(m.group(3)!);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  final dt = DateTime(y, mo, d);
  if (dt.year != y || dt.month != mo || dt.day != d) return null; // 2월 30일 등 튕김
  if (dt.isAfter(DateTime.now())) return null;
  return dt;
}

/// 관계 입력 — 칩 4종 + 「기타 +」(자유 입력). 실제 저장값은 자유 입력 controller의 텍스트다
/// (FAM-EDIT-12·13·데모 relation input과 같은 구조). 「기타 +」를 누르면 칩 선택을 풀어 직접
/// 적게 한다.
class RelationInput extends StatelessWidget {
  const RelationInput({super.key, required this.controller, required this.onChanged});
  final TextEditingController controller;
  final VoidCallback onChanged;

  bool get _isPreset => familyRelationOptions.contains(controller.text);

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final r in familyRelationOptions)
              _Chip(
                label: r,
                selected: controller.text == r,
                onTap: () {
                  controller.text = r;
                  onChanged();
                },
              ),
            _Chip(
              label: '기타 +',
              selected: controller.text.isNotEmpty && !_isPreset,
              onTap: () {
                controller.clear(); // 직접 입력으로 전환
                onChanged();
              },
            ),
          ],
        ),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          maxLength: 20,
          onChanged: (_) => onChanged(),
          decoration: const InputDecoration(
            hintText: '관계를 직접 입력할 수 있어요',
            counterText: '',
          ),
        ),
      ],
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    // 데모 NewFamily 관계 칩: Button size=sm(variant secondary/outline). Wrap 안이라 폭은 내용만큼.
    final style = AppButtonSize.shrink(AppButtonSize.sm);
    return selected
        ? FilledButton(
            onPressed: onTap,
            style: FilledButton.styleFrom(
              backgroundColor: AppTokens.primary,
              foregroundColor: Colors.white,
            ).merge(style),
            child: Text(label))
        : OutlinedButton(onPressed: onTap, style: style, child: Text(label));
  }
}

/// 굵은 라벨(칸 위) + 라벨 오른쪽 회색 설명 — 데모 정본.
class FieldLabel extends StatelessWidget {
  const FieldLabel(this.label, {super.key, this.trailing});
  final String label;
  final String? trailing;
  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        Text(label,
            style: const TextStyle(
                fontSize: 14, fontWeight: FontWeight.w600, color: AppTokens.onSurface)),
        if (trailing != null) ...[
          const SizedBox(width: 6),
          Text(trailing!, style: const TextStyle(fontSize: 12, color: AppTokens.grayPending)),
        ],
      ],
    );
  }
}
