import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/tokens.dart';
import '../../widgets/app_dialog.dart';
import 'family_repository.dart';

/// FAM-UNLINK — 되돌릴 수 없는 동작은 눈에 덜 띄게: 수정 화면 안쪽, 구분선 아래, 저장 버튼과 멀리.
/// 본인 카드에는 그리지 않는다(호출부가 isSelf로 거른다).
class UnlinkSection extends ConsumerStatefulWidget {
  const UnlinkSection({super.key, required this.member});
  final FamilyMember member;

  @override
  ConsumerState<UnlinkSection> createState() => _UnlinkSectionState();
}

class _UnlinkSectionState extends ConsumerState<UnlinkSection> {
  bool _busy = false;

  Future<void> _onTap() async {
    if (_busy) return;
    final m = widget.member;
    // ⭐ 앱이 먼저 가른다(반응 속도용) — 있으면 차단, 없으면 확인창. 판정 원본은 서버(아래 409).
    if (m.upcoming != null) {
      final go = await showUnlinkBlocked(context, m.upcoming!);
      if (go && mounted) context.push('/appointments/${m.upcoming!.appointmentId}');   // NAV-FAM-15
      return;
    }
    final ok = await showUnlinkConfirm(context);
    if (!ok) return;
    setState(() => _busy = true);
    try {
      await ref.read(familyRepositoryProvider).unlink(m.id);
      ref.invalidate(familyListProvider);
      if (mounted) context.go('/family');   // NAV-FAM-14
    } on UnlinkBlocked catch (e) {
      // 두 번째 그물 — 목록이 낡아 앱이 못 걸렀다(다른 폰에서 방금 예약). 같은 차단 팝업.
      if (mounted) {
        final go = await showUnlinkBlocked(context, e.upcoming);
        if (go && mounted) context.push('/appointments/${e.upcoming.appointmentId}');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 40),
      padding: const EdgeInsets.only(top: 24),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AppTokens.border)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('가족 연결 관리',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppTokens.onSurface)),
          const SizedBox(height: 8),
          const Text('연결을 해제하면 이 가족의 정보가 내 앱에서 보이지 않게 됩니다.',
              style: TextStyle(fontSize: 14, color: AppTokens.grayPending)),
          const SizedBox(height: 16),
          OutlinedButton(
            onPressed: _busy ? null : _onTap,
            child: const Text('연결 해제'),
          ),
        ],
      ),
    );
  }
}

/// FAM-UNLINK-05·06 — 확인창. 지킬 수 있는 문구로(옛 「과거 예약 이력은 그대로 남습니다」 금지).
/// [연결 해제]면 true, [닫기]·바깥이면 false.
/// 데모 FamilyEdit confirm 모달과 같은 커스텀 카드(`rounded-2xl border bg-card p-5 shadow-xl`)로
/// 통일한다(세션17 결정 B 잔여분). ⚠️ 버튼색은 결정4대로 **주의색(warn) 유지** — 재연결 가능해
/// 덜 파괴적이라 데모의 빨강 채움(destructive)은 이식하지 않는다. [연결 해제]는 TextButton 유지.
Future<bool> showUnlinkConfirm(BuildContext context) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (ctx) => AppDialogCard(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('가족 연결을 해제할까요?',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)), // 데모 text-base font-bold
          const SizedBox(height: 12), // mt-3
          const Text('병원 기록에는 그대로 남지만, 앱에서는 더 이상 보이지 않습니다.',
              style: TextStyle(fontSize: 14)),
          const SizedBox(height: 20), // mt-5
          Row(
            mainAxisAlignment: MainAxisAlignment.end, // 데모 justify-end
            children: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('닫기')),
              const SizedBox(width: 8), // gap-2
              TextButton(
                style: TextButton.styleFrom(foregroundColor: AppTokens.warn), // 되돌릴 수 없는 동작=주의색(결정4)
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('연결 해제'),
              ),
            ],
          ),
        ],
      ),
    ),
  );
  return r ?? false;
}

/// FAM-UNLINK-03·04 — 다가오는 예약이 있으면 막고 그 예약을 보여준다.
/// [예약 보러 가기]면 true(NAV-FAM-15), [닫기]면 false(그 자리에 남음 NAV-FAM-16).
/// 데모 FamilyDialog(blocked) 커스텀 카드: 본문 + full-width [예약 보러 가기](outline) + 우측 [닫기].
Future<bool> showUnlinkBlocked(BuildContext context, UpcomingBrief up) async {
  final go = await showDialog<bool>(
    context: context,
    builder: (ctx) => AppDialogCard(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('연결을 해제할 수 없어요',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12), // mt-3
          const Text('먼저 예약을 취소해 주세요.', style: TextStyle(fontSize: 14)),
          const SizedBox(height: 8), // mt-2
          Text('${_dateLabel(up.slotDate)} ${_time(up.startTime)} · ${up.departmentName}',
              style: const TextStyle(fontSize: 14, color: AppTokens.grayPending)),
          const SizedBox(height: 16), // mt-4
          // 데모: 예약 보러 가기 = full-width outline(NAV-FAM-15)
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
                onPressed: () => Navigator.pop(ctx, true), child: const Text('예약 보러 가기')),
          ),
          const SizedBox(height: 12), // mt-5 (footer 여백)
          Align(
            alignment: Alignment.centerRight, // 데모 justify-end
            child: TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('닫기')),
          ),
        ],
      ),
    ),
  );
  return go ?? false;
}

String _dateLabel(String iso) {
  final p = iso.split('-');
  if (p.length != 3) return iso;
  return '${int.parse(p[1])}월 ${int.parse(p[2])}일';
}

String _time(String t) => t.length >= 5 ? t.substring(0, 5) : t;
