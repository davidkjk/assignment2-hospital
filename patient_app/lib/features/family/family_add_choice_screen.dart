import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/tokens.dart';
import '../../widgets/action_button.dart';
import '../../widgets/block_dialog.dart';
import '../../widgets/warn_text.dart';
import 'family_repository.dart';

/// ㉮ 새 가족 등록 / ㉯ 기존 환자 연결 — 두 갈래.
enum FamilyAddBranch { newPatient, existingPatient }

/// FAM-ADD — 「어떤 가족을 추가하나」를 먼저 묻는 화면. 두 경로는 인증 유무·수정 권한·실패했을 때
/// 갈 곳이 전부 다르므로 한 화면에 섞지 않는다(FAM-ADD-01·02 — 화면 하나에 결정 하나).
class FamilyAddChoiceScreen extends ConsumerStatefulWidget {
  const FamilyAddChoiceScreen({super.key});
  @override
  ConsumerState<FamilyAddChoiceScreen> createState() => _FamilyAddChoiceScreenState();
}

class _FamilyAddChoiceScreenState extends ConsumerState<FamilyAddChoiceScreen> {
  FamilyAddBranch? _branch; // FAM-ADD-02: 고르기 전에는 진행하지 않는다
  bool _guarded = false;

  @override
  Widget build(BuildContext context) {
    final members = ref.watch(familyListProvider);

    // FAM-ADD-07: 진입 전에 상한을 본다. 목록 버튼(T25 FAM-LIST-12)에 더해 예약 1단계(NAV-FAM-17)로도
    // 들어오므로, 화면 자신이 한 번 더 확인해 10명이면 안내 팝업으로 막고 목록으로 돌려보낸다.
    members.whenData((list) {
      final linked = list.where((m) => !m.isSelf).length;
      if (linked >= 10 && !_guarded) {
        _guarded = true;
        WidgetsBinding.instance.addPostFrameCallback((_) async {
          if (!mounted) return;
          await showBlockDialog(
            context,
            title: '가족 추가',
            message: '가족은 최대 10명까지 등록하실 수 있습니다.\n더 필요하시면 병원에 문의해 주세요.',
          );
          if (context.mounted) context.go('/family'); // 막다른 길을 만들지 않는다
        });
      }
    });

    return Scaffold(
      appBar: AppBar(title: const Text('가족 추가')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text('어떤 가족을 추가하시나요?',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: AppTokens.onSurface)),
          const SizedBox(height: 4),
          const Text('둘 중 맞는 쪽을 골라주세요',
              style: TextStyle(fontSize: 14, color: AppTokens.grayPending)),
          const SizedBox(height: 20),

          // FAM-ADD-03 — ㉮.
          _BranchCard(
            icon: Icons.person_add_alt_1,
            selected: _branch == FamilyAddBranch.newPatient,
            onTap: () => setState(() => _branch = FamilyAddBranch.newPatient),
            title: '우리 병원이 처음이에요',
            body: '아직 진료받은 적이 없는 가족입니다. 이름·생년월일만 적으면 바로 등록됩니다.',
          ),
          const SizedBox(height: 12),

          // FAM-ADD-04·05 — ㉯. 주의색 한 줄을 **여기**(문자 발송 전)에 둔다.
          _BranchCard(
            icon: Icons.person_search_outlined,
            selected: _branch == FamilyAddBranch.existingPatient,
            onTap: () => setState(() => _branch = FamilyAddBranch.existingPatient),
            title: '전에 진료받은 적이 있어요',
            body: '이미 병원에 기록이 있는 가족입니다. 본인 확인을 위해 그분 휴대폰으로 인증번호를 보냅니다.',
            warn: const WarnText(
                '휴대폰이 없거나 번호가 바뀐 가족이면 병원에 문의해 주세요. 직원이 확인 후 연결해 드립니다.'),
          ),
          const SizedBox(height: 24),

          ActionButton(
            label: '다음',
            busyLabel: '이동 중…',
            disabledReason: _branch == null ? '위에서 한 가지를 골라주세요' : null,
            onPressed: () => context.push(_branch == FamilyAddBranch.newPatient
                ? '/family/add/new'
                : '/family/add/link'),
          ),
        ],
      ),
    );
  }
}

/// 라디오 점 대신 카드 전체가 눌림 대상 — 어르신이 맞히기 쉽다(목업 25 ①). 고르면 딥틸 테두리.
class _BranchCard extends StatelessWidget {
  const _BranchCard({
    required this.icon,
    required this.selected,
    required this.onTap,
    required this.title,
    required this.body,
    this.warn,
  });
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  final String title;
  final String body;
  final Widget? warn;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppTokens.primary.withValues(alpha: 0.06) : AppTokens.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected ? AppTokens.primary : AppTokens.border,
              width: selected ? 2 : 1,
            ),
          ),
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                decoration: BoxDecoration(
                  color: AppTokens.primary.withValues(alpha: 0.10),
                  shape: BoxShape.circle,
                ),
                padding: const EdgeInsets.all(8),
                child: Icon(icon, size: 22, color: AppTokens.primary),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w700, color: AppTokens.onSurface)),
                    const SizedBox(height: 4),
                    Text(body,
                        style: const TextStyle(fontSize: 14, color: AppTokens.grayPending)),
                    if (warn != null) ...[const SizedBox(height: 8), warn!],
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
