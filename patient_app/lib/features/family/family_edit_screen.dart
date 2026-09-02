import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/button_sizes.dart';
import '../../core/tokens.dart';
import '../../widgets/action_button.dart';
import '../../widgets/empty_state.dart';
import 'family_form_bits.dart'; // GenderBox(신규·수정 공용)
import 'family_repository.dart';
import 'unlink_section.dart';

const _relationOptions = ['아들', '딸', '배우자', '부모'];   // FAM-EDIT-12 (데모 relationOptions)

/// FAM-EDIT — 위는 「그 사람의 정보」(잠길 수 있다), 아래는 「나와의 관계」(항상 열림).
/// 화면은 familyListProvider에서 그 사람 하나를 골라 그린다(별도 상세 API 없음 — FAM-EDIT-10).
class FamilyEditScreen extends ConsumerStatefulWidget {
  const FamilyEditScreen({super.key, required this.familyPatientId});
  final String familyPatientId;

  @override
  ConsumerState<FamilyEditScreen> createState() => _FamilyEditScreenState();
}

class _FamilyEditScreenState extends ConsumerState<FamilyEditScreen> {
  final _name = TextEditingController();
  final _birth = TextEditingController();
  final _relation = TextEditingController();
  String _gender = '';
  bool _seeded = false;
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _birth.dispose();
    _relation.dispose();
    super.dispose();
  }

  void _seed(FamilyMember m) {
    if (_seeded) return;
    _seeded = true;
    _name.text = m.name;
    _birth.text = m.birthDate;
    _relation.text = m.isSelf ? '' : m.relation;
    _gender = m.gender;
  }

  bool get _valid => _name.text.trim().isNotEmpty && _birth.text.trim().isNotEmpty && _gender.isNotEmpty;

  Future<void> _save(FamilyMember m) async {
    if (!_valid || _saving) return;
    setState(() => _saving = true);
    final repo = ref.read(familyRepositoryProvider);
    try {
      // FAM-EDIT-02 — 두 창구로 나눠 보낸다. 잠긴 신원은 서버로 보내지 않는다(관계만).
      if (m.canEditIdentity) {
        await repo.updateIdentity(m.id,
            name: _name.text.trim(), birthDate: _birth.text.trim(), gender: _gender);
      }
      if (!m.isSelf) {
        await repo.updateRelation(m.id, _relation.text.trim().isEmpty ? '가족' : _relation.text.trim());
      }
      ref.invalidate(familyListProvider);
      if (mounted) context.go('/family');   // NAV-FAM-13
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(familyListProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('가족 정보 수정'),
        leading: BackButton(onPressed: () => context.go('/family')),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => EmptyState.error(onRetry: () => ref.invalidate(familyListProvider)),
        data: (members) {
          final m = members.where((e) => e.id == widget.familyPatientId).firstOrNull;
          if (m == null) {
            return Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Text('가족 정보를 찾을 수 없습니다.', style: TextStyle(color: AppTokens.grayPending)),
                const SizedBox(height: 16),
                OutlinedButton(
                    onPressed: () => context.go('/family'), child: const Text('가족 목록 보기')),
              ]),
            );
          }
          _seed(m);
          return _EditBody(
            member: m,
            name: _name,
            birth: _birth,
            relation: _relation,
            gender: _gender,
            onGender: (g) => setState(() => _gender = g),
            onChanged: () => setState(() {}),
            saving: _saving,
            valid: _valid,
            onSave: () => _save(m),
          );
        },
      ),
    );
  }
}

class _EditBody extends StatelessWidget {
  const _EditBody({
    required this.member,
    required this.name,
    required this.birth,
    required this.relation,
    required this.gender,
    required this.onGender,
    required this.onChanged,
    required this.saving,
    required this.valid,
    required this.onSave,
  });

  final FamilyMember member;
  final TextEditingController name, birth, relation;
  final String gender;
  final ValueChanged<String> onGender;
  final VoidCallback onChanged;
  final bool saving, valid;
  final VoidCallback onSave;

  bool get _editable => member.canEditIdentity;

  @override
  Widget build(BuildContext context) {
    final title = member.isSelf ? '내 정보' : '${member.name}님의 정보';
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: AppTokens.onSurface)),
        const SizedBox(height: 8),
        if (_editable)
          const Text('이름·생년월일·성별과 관계를 바꿀 수 있어요.',
              style: TextStyle(fontSize: 14, color: AppTokens.grayPending))
        else
          LockedFieldNote(reason: member.identityLockReason),
        const SizedBox(height: 20),

        _LabeledInput(label: '이름', controller: name, enabled: _editable, onChanged: onChanged),
        const SizedBox(height: 16),
        _LabeledInput(
            label: '생년월일', controller: birth, enabled: _editable, onChanged: onChanged,
            hint: '1990-01-01', keyboardType: TextInputType.datetime),
        const SizedBox(height: 16),

        // FAM-EDIT-11 — 성별 두 칸 중 하나, 미리 골라두지 않는다.
        const Text('성별', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTokens.onSurface)),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: GenderBox(label: '여', value: 'F', selected: gender == 'F', enabled: _editable, onSelect: onGender)),
          const SizedBox(width: 8),
          Expanded(child: GenderBox(label: '남', value: 'M', selected: gender == 'M', enabled: _editable, onSelect: onGender)),
        ]),

        // FAM-EDIT-01 — 「나와의 관계」는 본인이 아닌 가족에게만(연결선이 없는 본인엔 안 그림).
        if (!member.isSelf) ...[
          const SizedBox(height: 20),
          const Text('관계', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTokens.onSurface)),
          const SizedBox(height: 8),
          RelationChips(
            value: relation.text,
            onSelect: (r) { relation.text = r; onChanged(); },
          ),
          const SizedBox(height: 8),
          TextField(
            controller: relation,
            maxLength: 20,
            onChanged: (_) => onChanged(),
            decoration: const InputDecoration(
              hintText: '관계를 직접 입력할 수 있어요',
              counterText: '',
            ),
          ),
        ],

        const SizedBox(height: 20),
        ActionButton(
          label: '저장하기',
          busyLabel: '저장 중…',
          busy: saving,
          style: AppButtonSize.lg, // 데모 FamilyEdit: size=lg w-full
          disabledReason: valid ? null : '이름·생년월일·성별을 모두 입력해 주세요',
          onPressed: onSave,
        ),

        // FAM-UNLINK-01 — 해제는 여기, 구분선 아래·저장 버튼과 멀리. 본인엔 없다(FAM-UNLINK-02).
        if (!member.isSelf) UnlinkSection(member: member),
      ],
    );
  }
}

/// FAM-EDIT-05·08·15 — 왜 못 고치는지 + 어디로 가야 하는지 한 줄(막다른 길 금지).
class LockedFieldNote extends StatelessWidget {
  const LockedFieldNote({super.key, required this.reason});
  final String? reason;   // 'linked' | 'has_history'

  static String reasonText(String? reason) => reason == 'linked'
      ? '병원에 문의하시면 수정해 드립니다'
      : '진료 기록이 있어 병원에서만 수정할 수 있습니다';

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text.rich(
          TextSpan(children: [
            TextSpan(
                text: '이름·생년월일·성별',
                style: TextStyle(fontWeight: FontWeight.w600, color: AppTokens.onSurface)),
            TextSpan(text: '은 여기서 바꿀 수 없어요. 관계는 언제든 바꿀 수 있어요.'),
          ]),
          style: TextStyle(fontSize: 14, color: AppTokens.grayPending),
        ),
        const SizedBox(height: 4),
        Text(reasonText(reason),
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: AppTokens.onSurface)),
      ],
    );
  }
}

/// FAM-EDIT-12·13 — 관계 칩 4종. 고르면 자유 입력칸에도 반영(자유 입력이 실제 저장값).
class RelationChips extends StatelessWidget {
  const RelationChips({super.key, required this.value, required this.onSelect});
  final String value;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final r in _relationOptions)
          _Chip(label: r, selected: value == r, onTap: () => onSelect(r)),
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
    // 데모 FamilyEdit 관계 칩: Button size=sm(variant secondary/outline). Wrap 안이라 폭은 내용만큼.
    final chipStyle = AppButtonSize.shrink(AppButtonSize.sm);
    return selected
        ? FilledButton(
            onPressed: onTap,
            style: FilledButton.styleFrom(
              backgroundColor: AppTokens.muted,
              foregroundColor: AppTokens.onSurface,
            ).merge(chipStyle),
            child: Text(label))
        : OutlinedButton(onPressed: onTap, style: chipStyle, child: Text(label));
  }
}

class _LabeledInput extends StatelessWidget {
  const _LabeledInput({
    required this.label,
    required this.controller,
    required this.enabled,
    required this.onChanged,
    this.hint,
    this.keyboardType,
  });
  final String label;
  final TextEditingController controller;
  final bool enabled;
  final VoidCallback onChanged;
  final String? hint;
  final TextInputType? keyboardType;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTokens.onSurface)),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          enabled: enabled,   // 잠긴 칸 = 회색 채움 대신 배경색(데모 disabled:bg-transparent)
          keyboardType: keyboardType,
          onChanged: (_) => onChanged(),
          style: const TextStyle(fontSize: 16, color: AppTokens.onSurface),
          decoration: InputDecoration(hintText: hint),
        ),
      ],
    );
  }
}

// 성별 칸은 신규·수정 공용 위젯 GenderBox(family_form_bits.dart)로 통일했다(라디오 점 = 데모).
