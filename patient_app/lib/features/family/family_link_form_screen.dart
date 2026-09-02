import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/phone_cooldown.dart';
import '../../core/button_sizes.dart';
import '../../core/tokens.dart';
import '../../widgets/action_button.dart';
import '../../widgets/inline_error.dart';
import '../../widgets/labeled_field.dart';
import 'family_add_repository.dart';
import 'family_form_bits.dart';

/// FAM-LINK(입력) — ㉯ 이미 병원에 기록이 있는 가족을 연결. 그분 휴대폰으로 인증번호를 보낸다.
/// ⭐ 성별을 묻지 않는다(FAM-LINK-03 — 병원 기록의 값을 쓴다). ⭐ 안내 상자가 이 화면(문자 발송 전)에
/// 있는 것이 결정 B-36의 요점이다(FAM-LINK-15) — 인증번호 화면은 이미 문자가 나간 뒤라 늦다.
class FamilyLinkFormScreen extends ConsumerStatefulWidget {
  const FamilyLinkFormScreen({super.key});
  @override
  ConsumerState<FamilyLinkFormScreen> createState() => _FamilyLinkFormScreenState();
}

class _FamilyLinkFormScreenState extends ConsumerState<FamilyLinkFormScreen> {
  final _name = TextEditingController();
  final _birth = TextEditingController();
  final _phone = TextEditingController();
  final _relation = TextEditingController(text: '어머니');
  bool _busy = false;
  String? _error;
  bool _showFamilyListLink = false; // FAM-LINK-09 — 이미 연결일 때만 「가족 목록 보기」
  String? _nameError;
  String? _birthError;
  String? _phoneError;

  @override
  void initState() {
    super.initState();
    // NAV-FAM-10 — 인증 화면에 다녀와서 돌아온 경우 입력값을 되살린다(다시 치게 하지 않는다).
    final draft = ref.read(linkDraftProvider);
    if (draft != null) {
      _name.text = draft.name;
      _birth.text =
          '${draft.birthDate.year.toString().padLeft(4, '0')}-${draft.birthDate.month.toString().padLeft(2, '0')}-${draft.birthDate.day.toString().padLeft(2, '0')}';
      _phone.text = draft.phone;
      _relation.text = draft.relation;
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _birth.dispose();
    _phone.dispose();
    _relation.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final birth = parseFamilyBirth(_birth.text);
    setState(() {
      _nameError = _name.text.trim().isEmpty ? '이름을 적어주세요' : null;
      _birthError = birth == null ? '생년월일을 1990-01-01 형식으로 적어주세요' : null;
      _phoneError = familyPhoneValid(_phone.text) ? null : '휴대폰 번호를 적어주세요';
    });
    if (_nameError != null || _birthError != null || _phoneError != null) return;

    setState(() {
      _busy = true;
      _error = null;
      _showFamilyListLink = false;
    });
    final store = ref.read(phoneCooldownStoreProvider);
    final phone = _phone.text.trim();
    try {
      final requestId = await ref.read(familyAddRepoProvider).requestLink(
            name: _name.text.trim(),
            birthDate: birth!,
            phone: phone,
            relation: _relation.text.trim().isEmpty ? '가족' : _relation.text.trim(),
          );
      // NAV-FAM-10 — 입력값을 남겨 둔다(인증 화면에서 뒤로 오면 그대로 있어야 한다).
      ref.read(linkDraftProvider.notifier).state = LinkDraft(
        name: _name.text.trim(),
        birthDate: birth,
        phone: phone,
        relation: _relation.text.trim().isEmpty ? '가족' : _relation.text.trim(),
        requestId: requestId,
      );
      await store.start(phone, DateTime.now()); // FAM-LINK-22 — 쿨다운은 번호 기준
      if (mounted) context.push('/family/add/link/otp'); // NAV-FAM-09
    } on ApiException catch (e) {
      // FAM-LINK-09·10 — 이 둘(본인·이미 연결)만 사실대로 온다. 그 밖의 실패(0건·2건)는 열거 방지로
      // 성공처럼 진행하므로 여기 오지 않는다.
      if (!mounted) return;
      if (e.statusCode == 429 && e.retryAfterSeconds != null) {
        await store.syncFromServer(phone, e.retryAfterSeconds!, DateTime.now()); // 서버 값에 맞춘다
      }
      setState(() {
        _error = e.message;
        _showFamilyListLink = e.message.contains('이미 가족으로');
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('가족 확인')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text('가족분 정보를 입력해 주세요',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: AppTokens.onSurface)),
          const SizedBox(height: 4),
          const Text('입력하신 휴대폰으로 인증번호를 보냅니다',
              style: TextStyle(fontSize: 14, color: AppTokens.grayPending)),
          const SizedBox(height: 16),

          LabeledField(label: '이름', controller: _name, hint: '가족 이름을 입력해 주세요'),
          if (_nameError != null) _fieldError(_nameError!),
          const SizedBox(height: 16),

          LabeledField(
              label: '생년월일',
              controller: _birth,
              hint: '1990-01-01',
              keyboardType: TextInputType.datetime),
          if (_birthError != null) _fieldError(_birthError!),
          const SizedBox(height: 16),

          LabeledField(
              label: '휴대폰 번호',
              controller: _phone,
              hint: '010-0000-0000',
              keyboardType: TextInputType.phone),
          if (_phoneError != null) _fieldError(_phoneError!),
          // FAM-LINK-03 ⛔ 성별 칸은 두지 않는다 — 병원 기록의 값을 쓴다.
          const SizedBox(height: 16),

          const FieldLabel('나와의 관계'),
          const SizedBox(height: 8),
          RelationInput(controller: _relation, onChanged: () => setState(() {})),
          const SizedBox(height: 16),

          // FAM-LINK-14·15·16·17 — 자리는 이 화면, 문구는 「없거나 · 바뀐」 둘 다.
          // NAV-FAM-12 — 병원 안내(전화·길찾기)로 보낸다. 앱이 판정할 수 없는 경우의 유일한 출구다.
          _HospitalGuideBox(onTap: () => context.push('/settings/hospital')),
          const SizedBox(height: 16),

          InlineError(_error),
          if (_showFamilyListLink) // FAM-LINK-09 — 막다른 길을 만들지 않는다
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                  onPressed: () => context.go('/family'), child: const Text('가족 목록 보기')),
            ),
          const SizedBox(height: 4),
          ActionButton(
            label: '인증번호 받기',
            busyLabel: '보내는 중…',
            busy: _busy,
            style: AppButtonSize.lg, // 데모 ExistingFamily: size=lg w-full
            onPressed: _send,
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

/// FAM-LINK-14·16·17 — 「휴대폰이 없거나, 번호가 바뀐 가족인가요?」 안내 → 병원 안내 화면.
class _HospitalGuideBox extends StatelessWidget {
  const _HospitalGuideBox({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppTokens.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        // 부모 Material(흰 면·radius)이 표면을 준다 — 테두리 없이 평평하게(데모 「테두리→그림자」).
        child: const Padding(
          padding: EdgeInsets.all(14),
          child: const Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('휴대폰이 없거나, 번호가 바뀐 가족인가요? ›',
                        style: TextStyle(fontWeight: FontWeight.w600, color: AppTokens.onSurface)),
                    SizedBox(height: 4),
                    Text('병원에 전화하거나 방문하시면 직원이 확인 후 연결해 드립니다.',
                        style: TextStyle(fontSize: 12, color: AppTokens.grayPending)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
