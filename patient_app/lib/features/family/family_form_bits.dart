import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';

import '../../core/button_sizes.dart';
import '../../core/tokens.dart';

/// FAM-EDIT-12 관계 4종(데모 relationOptions)과 같은 목록.
const familyRelationOptions = ['아들', '딸', '배우자', '아버지', '어머니'];

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

/// 성별 선택 한 칸(FAM-NEW-02·FAM-EDIT-11) — 신규·수정 화면이 **같은 위젯**을 쓴다.
/// 데모(NewFamily·FamilyEdit 동일): `rounded-lg border px-3 py-3` 박스 + 네이티브 라디오 점 + 라벨.
/// 선택 시 `border-primary bg-primary/10 text-primary`. 미리 골라두지 않는다(호출부가 selected 판정).
/// [enabled]이 false면(수정 화면의 잠긴 신원) 누를 수 없고 글자를 회색으로 죽인다.
class GenderBox extends StatelessWidget {
  const GenderBox({
    super.key,
    required this.label,
    required this.value,
    required this.selected,
    required this.onSelect,
    this.enabled = true,
  });
  final String label;
  final String value;
  final bool selected;
  final ValueChanged<String> onSelect;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final fg = selected
        ? AppTokens.primary
        : (enabled ? AppTokens.onSurface : AppTokens.grayPending);
    return InkWell(
      onTap: enabled ? () => onSelect(value) : null,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12), // 데모 px-3 py-3
        decoration: BoxDecoration(
          color: selected ? AppTokens.primary.withValues(alpha: 0.10) : AppTokens.surface, // bg-primary/10
          borderRadius: BorderRadius.circular(10), // rounded-lg
          border: Border.all(color: selected ? AppTokens.primary : AppTokens.border), // border → border-primary
        ),
        child: Row(
          children: [
            // 데모 네이티브 라디오 점(items-center gap-2, 좌측)
            Icon(selected ? AppIcons.radio_button_checked : AppIcons.radio_button_unchecked,
                size: 18, color: selected ? AppTokens.primary : AppTokens.grayPending),
            const SizedBox(width: 8), // gap-2
            Text(label, style: TextStyle(fontSize: 15, color: fg)),
          ],
        ),
      ),
    );
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
