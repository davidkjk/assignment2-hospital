import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/connectivity.dart';
import '../../core/button_sizes.dart';
import '../../core/tokens.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/patient_app_bar.dart';
import 'family_repository.dart';

/// FAM-LIST — 본인 + 연결된 가족을 한 목록으로. 정렬·본인 판정은 서버가 끝냈다(order by).
/// 화면은 familyListProvider를 그대로 그린다(다시 정렬/판정하지 않는다).
class FamilyListScreen extends ConsumerWidget {
  const FamilyListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(familyListProvider);
    return Scaffold(
      appBar: PatientAppBar(title: '가족 관리', icon: Icons.groups),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) {
          // NAV-FAM-19 — 오프라인/조회 실패는 가운데 안내 + [다시 시도]. 가족 목록은 캐시 대상이 아니다.
          final offline = ref.read(connectivityProvider).valueOrNull == false;
          return offline
              ? EmptyState.offline(
                  screenName: '가족 관리',
                  onRetry: () => ref.invalidate(familyListProvider))
              : EmptyState.error(onRetry: () => ref.invalidate(familyListProvider));
        },
        data: (members) => _FamilyListBody(members: members),
      ),
    );
  }
}

class _FamilyListBody extends StatelessWidget {
  const _FamilyListBody({required this.members});
  final List<FamilyMember> members;

  @override
  Widget build(BuildContext context) {
    // 서버가 이미 본인 맨 위 + 이름순으로 준다(FAM-LIST-01·02). 화면은 순서를 지킨다.
    final familyCount = members.where((m) => !m.isSelf).length;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const Text('본인과 연결된 가족의 정보를 관리할 수 있어요.',
            style: TextStyle(fontSize: 14, color: AppTokens.grayPending)),
        const SizedBox(height: 16),
        for (final m in members) ...[
          FamilyCard(
            member: m,
            onEdit: () => context.push('/family/${m.id}/edit'),
            onTapUpcoming: m.upcoming == null
                ? null
                : () => context.push('/appointments/${m.upcoming!.appointmentId}'),
          ),
          const SizedBox(height: 16),
        ],
        const SizedBox(height: 4),
        // FAM-LIST-10·12 — 항상 있고, 10명이면 눌렀을 때 안내(죽은 버튼 금지). 이동은 읽기라 ActionButton 아님.
        OutlinedButton.icon(
          onPressed: () {
            if (familyCount >= 10) {
              showDialog<void>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: const Text('가족을 더 추가할 수 없어요'),
                  content: const Text('가족은 최대 10명까지 등록하실 수 있습니다.\n더 필요하시면 병원에 문의해 주세요.'),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('닫기')),
                  ],
                ),
              );
            } else {
              context.push('/family/add');
            }
          },
          icon: const Icon(Icons.person_add_alt_1, size: 20),
          label: const Text('가족 추가하기'),
          style: AppButtonSize.lg, // 데모 FamilyList: variant=outline size=lg w-full
        ),
      ],
    );
  }
}

/// FAM-LIST-03·04·05 — 관계를 제일 큰 제목으로(가족을 관계로 찾는다, A안) + 이름·생년월일·성별 한 줄.
/// 카드 행동은 [정보 수정] 하나뿐 — [예약하기]·[연결 해제]를 두지 않는다.
class FamilyCard extends StatelessWidget {
  const FamilyCard({super.key, required this.member, required this.onEdit, this.onTapUpcoming});
  final FamilyMember member;
  final VoidCallback onEdit;
  final VoidCallback? onTapUpcoming;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppTokens.surface,
        borderRadius: BorderRadius.circular(12),
        boxShadow: AppTokens.cardElevation,
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(member.relation,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 18, fontWeight: FontWeight.w700, color: AppTokens.onSurface)),
                    const SizedBox(height: 2),
                    Text.rich(
                      TextSpan(children: [
                        TextSpan(
                            text: member.name,
                            style: const TextStyle(
                                fontWeight: FontWeight.w600, color: AppTokens.onSurface)),
                        TextSpan(
                            text: ' · ${_birth(member.birthDate)} · ${_gender(member.gender)}'),
                      ]),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 14, color: AppTokens.grayPending),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              OutlinedButton.icon(
                onPressed: onEdit,
                icon: const Icon(Icons.edit_outlined, size: 15),
                label: const Text('정보 수정'),
                // 데모 FamilyList [정보 수정]: variant=outline size=sm. Row 안이라 폭은 내용만큼.
                style: AppButtonSize.shrink(AppButtonSize.sm),
              ),
            ],
          ),
          if (member.upcoming != null) ...[
            const SizedBox(height: 14),
            SizedBox(
                width: double.infinity,
                child: UpcomingRow(upcoming: member.upcoming!, onTap: onTapUpcoming)),
          ],
        ],
      ),
    );
  }
}

/// FAM-LIST-06·07 — 다가오는 예약 한 줄(가장 가까운 1건). 누르면 예약 상세로(NAV-FAM-05).
class UpcomingRow extends StatelessWidget {
  const UpcomingRow({super.key, required this.upcoming, this.onTap});
  final UpcomingBrief upcoming;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: onTap,
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        foregroundColor: AppTokens.onSurface,
      ),
      child: Row(
        children: [
          const Icon(Icons.calendar_today_outlined, size: 16, color: AppTokens.primary),
          const SizedBox(width: 8),
          Expanded(
            child: Text('${_dateLabel(upcoming.slotDate)} ${_time(upcoming.startTime)} · ${upcoming.departmentName}',
                style: const TextStyle(fontSize: 14, color: AppTokens.onSurface)),
          ),
          const Icon(Icons.chevron_right, size: 18, color: AppTokens.grayPending),
        ],
      ),
    );
  }
}

// F/M을 사람 말로(FAM-LIST-03). 데모 genderLabel.
String _gender(String g) => g == 'M' ? '남' : '여';

// 데모 formatBirthDate: 1950-01-01 → 1950.01.01
String _birth(String iso) => iso.replaceAll('-', '.');

// 데모 appointmentDateLabel: 2026-09-01 → 9월 1일
String _dateLabel(String iso) {
  final p = iso.split('-');
  if (p.length != 3) return iso;
  return '${int.parse(p[1])}월 ${int.parse(p[2])}일';
}

// 14:00:00 → 14:00
String _time(String t) => t.length >= 5 ? t.substring(0, 5) : t;
