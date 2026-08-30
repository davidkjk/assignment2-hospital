import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/tokens.dart';
import '../../widgets/action_button.dart';
import '../../widgets/block_dialog.dart';
import '../../widgets/inline_error.dart';
import '../../widgets/labeled_field.dart';
import '../../widgets/warn_text.dart';
import 'family_add_repository.dart';
import 'family_form_bits.dart';
import 'family_repository.dart';

/// FAM-NEW — ㉮ 새 가족 등록(병원 명부에 새 사람을 만드는 일 · 인증 없음 · 수정 가능).
/// ⭐ 성별 기본값을 두지 않는 것이 이 화면의 심장이다(FAM-NEW-03·04·05) — 안 건드리면 조용히
/// 저장돼 사전문진 「보일 대상」을 가른다. 없는 질문은 없는 줄도 모른다.
class FamilyNewScreen extends ConsumerStatefulWidget {
  const FamilyNewScreen({super.key});
  @override
  ConsumerState<FamilyNewScreen> createState() => _FamilyNewScreenState();
}

class _FamilyNewScreenState extends ConsumerState<FamilyNewScreen> {
  final _name = TextEditingController();
  final _birth = TextEditingController();
  final _phone = TextEditingController();
  final _relation = TextEditingController(text: '아들');
  String? _gender; // ⭐ 기본값 없음('F'로 시작하지 않는다)
  bool _busy = false;
  String? _error;
  String? _nameError;
  String? _birthError;

  @override
  void dispose() {
    _name.dispose();
    _birth.dispose();
    _phone.dispose();
    _relation.dispose();
    super.dispose();
  }

  bool get _ready => _gender != null; // FAM-NEW-02 — 성별을 고르기 전에는 버튼이 죽어 있다

  Future<void> _submit() async {
    // FAM-NEW-04·05 — 안 고른 성별을 대신 채우지 않는다. 이름·생년월일도 여기서 검사한다.
    final birth = parseFamilyBirth(_birth.text);
    setState(() {
      _nameError = _name.text.trim().isEmpty ? '이름을 적어주세요' : null;
      _birthError = birth == null ? '생년월일을 1990-01-01 형식으로 적어주세요' : null;
    });
    if (_nameError != null || _birthError != null || _gender == null) return;

    setState(() => _busy = true);
    try {
      await ref.read(familyAddRepoProvider).addNew(
            name: _name.text.trim(),
            birthDate: birth!,
            gender: _gender!,
            relation: _relation.text.trim().isEmpty ? '가족' : _relation.text.trim(),
            // FAM-NEW-08 ⛔ 비어 있으면 null — 보호자 번호를 복사해 넣지 않는다(갭 #3).
            phone: _phone.text.trim().isEmpty ? null : _phone.text.trim(),
          );
      ref.invalidate(familyListProvider); // FAM-NEW-16 — 새 카드가 목록에 있다
      if (mounted) context.go('/family'); // NAV-FAM-08 — 갈래 선택을 뒤에 안 남긴다
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.statusCode == 409) {
        // FAM-NEW-10·11 — 판정은 서버가 했다. 화면은 그 문장을 막힘 안내로 보여줄 뿐이다.
        await showBlockDialog(
          context,
          title: '가족 추가',
          message: '${e.message}\n더 필요하시면 병원에 문의해 주세요.',
        );
      } else {
        setState(() => _error = e.message); // 그 밖의 실패는 버튼 위 붙박이(ERR 계열)
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('가족 정보')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text('가족 정보를 입력해 주세요',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: AppTokens.onSurface)),
          const SizedBox(height: 4),
          const Text('새로운 환자 프로필을 만듭니다.',
              style: TextStyle(fontSize: 14, color: AppTokens.grayPending)),
          const SizedBox(height: 16),

          // FAM-NEW-13·14 — 상시 안내(잘못 들어온 사람을 위한 두 번째 그물). 팝업이 아니다.
          const WarnText('이미 병원에 방문·예약하신 적 있는 가족이라면 새로 추가하지 마세요. '
              '새로 추가하면 과거 기록과 별도로 관리됩니다.'),
          const SizedBox(height: 20),

          LabeledField(label: '이름', controller: _name, hint: '이름을 입력해 주세요'),
          if (_nameError != null) _fieldError(_nameError!),
          const SizedBox(height: 16),

          LabeledField(
              label: '생년월일',
              controller: _birth,
              hint: '1990-01-01',
              keyboardType: TextInputType.datetime),
          if (_birthError != null) _fieldError(_birthError!),
          const SizedBox(height: 16),

          // FAM-NEW-02·06 — 성별 + 왜 묻는지(가입 화면과 같은 문구). 미리 골라두지 않는다.
          const FieldLabel('성별', trailing: '(문진 문항 노출에 쓰입니다)'),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(
                child: _GenderBox(
                    label: '여', selected: _gender == 'F', onTap: () => setState(() => _gender = 'F'))),
            const SizedBox(width: 8),
            Expanded(
                child: _GenderBox(
                    label: '남', selected: _gender == 'M', onTap: () => setState(() => _gender = 'M'))),
          ]),
          const SizedBox(height: 20),

          const FieldLabel('나와의 관계'),
          const SizedBox(height: 8),
          RelationInput(controller: _relation, onChanged: () => setState(() {})),
          const SizedBox(height: 16),

          // FAM-NEW-07 — 선택 입력. 라벨에 「없으면 비워두세요」를 붙여 필수처럼 보이지 않게 한다.
          LabeledField(
              label: '전화번호 (없으면 비워두세요)',
              controller: _phone,
              hint: '010-0000-0000',
              keyboardType: TextInputType.phone),
          const SizedBox(height: 6),
          const Text('비워두시면 보호자(내) 번호로 표시되고, 알림도 내 휴대폰으로 옵니다.',
              style: TextStyle(fontSize: 12, color: AppTokens.grayPending)),
          // FAM-NEW-09 — 이 번호는 인증하지 않는다. 병원이 연락할 때 쓰는 값이고 알림은 계정 소유자에게 간다.
          const SizedBox(height: 20),

          InlineError(_error),
          ActionButton(
            label: '등록하기',
            busyLabel: '등록 중…', // FAM-NEW-15
            busy: _busy,
            disabledReason: _ready ? null : '성별을 골라주세요',
            onPressed: _submit,
          ),
        ],
      ),
    );
  }

  Widget _fieldError(String msg) => Padding(
        padding: const EdgeInsets.only(top: 4, left: 4),
        child: Text(msg, style: const TextStyle(color: AppTokens.warn, fontSize: 13)),
      );
}

/// FAM-NEW-02 — 성별 두 칸 중 하나(가입 ③·수정 화면과 같은 토글). 미리 골라두지 않는다.
class _GenderBox extends StatelessWidget {
  const _GenderBox({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: onTap,
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(48),
        backgroundColor: selected ? AppTokens.primary.withValues(alpha: 0.10) : null,
        foregroundColor: selected ? AppTokens.primary : AppTokens.onSurface,
        side: BorderSide(color: selected ? AppTokens.primary : AppTokens.border, width: selected ? 2 : 1),
      ),
      child: Text(label,
          style: TextStyle(fontSize: 16, fontWeight: selected ? FontWeight.w700 : FontWeight.w500)),
    );
  }
}
