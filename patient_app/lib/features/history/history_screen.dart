import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/pending_request.dart' show koreanTime;
import '../../core/tokens.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/patient_app_bar.dart';
import '../appointment/appointment_detail.dart' show appointmentDetailProvider;
import '../family/family_repository.dart';
import '../notifications/notification_gone_dialog.dart' show showNotificationGoneDialog;
import 'history_repository.dart';
import 'history_row_detail.dart';

/// 취소 날짜·시각 한 줄(HIST-ROW-03) — '7월 18일 오후 3:12'. 카드(T17)와 같은 어휘.
String _cancelDateTime(DateTime t) => '${t.month}월 ${t.day}일 ${koreanTime(t)}';

/// 취소 주체 한 줄(HIST-ROW-02·05) — CxlBody(T17)와 같은 의미라 카드·이력 문구가 어긋나지 않는다.
String _cancelActorText(VisitHistoryEntry e) {
  if (e.cancelledBy == 'hospital') return '병원에서 취소'; // HIST-ROW-05: 직원 이름 없음
  if (e.isSelf) return '본인 취소'; // HIST-ROW-02
  return '${e.cancelledByRelation ?? ''} ${e.cancelledByName ?? ''} 님 취소'.trim();
}

/// 가로 이름 칩 — 본인 먼저·가족 이름순. 가족 0명이면 줄 자체를 감춘다(HIST-WHO-04).
class NameChips extends StatelessWidget {
  const NameChips({super.key, required this.members, required this.selectedId, required this.onSelect});
  final List<FamilyMember> members;
  final String? selectedId;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    if (members.length <= 1) return const SizedBox.shrink(); // HIST-WHO-04: 가족 0명이면 칩 줄 없음
    final sorted = [...members]..sort((x, y) {
        // HIST-WHO-02: 본인 먼저, 가족 이름순
        if (x.isSelf != y.isSelf) return x.isSelf ? -1 : 1;
        return x.name.compareTo(y.name);
      });
    return SingleChildScrollView(
      key: const Key('history-chip-row'),
      scrollDirection: Axis.horizontal, // HIST-WHO-05: 가로 스크롤(줄바꿈 아님)
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(children: [
        for (final m in sorted)
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ChoiceChip(
              label: Text(m.name),
              selected: m.id == selectedId,
              onSelected: (_) => onSelect(m.id), // HIST-WHO-10: 콜백만(화면 안 옮김)
            ),
          ),
      ]),
    );
  }
}

const _weekdayNames = ['월', '화', '수', '목', '금', '토', '일']; // DateTime.weekday: 월=1
String _weekdayKo(DateTime d) => _weekdayNames[d.weekday - 1];

/// 날짜 레일 — 월 작게 / 일 크게(고정폭) / 요일 작게(HIST-LIST-04).
/// 데모(History.tsx `border-l-4`)처럼 왼쪽에 4px 강조 바 — 색은 HIST-LIST-05·06(레일 색) 그대로.
class DateRail extends StatelessWidget {
  const DateRail({super.key, required this.date, required this.color});
  final DateTime? date;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
        width: 44, // HIST-LIST-04: 고정폭(바 4 + 여백 8 + 내용 32)
        decoration: date == null
            ? null
            : BoxDecoration(
                border: Border(left: BorderSide(color: color, width: 4)), // 데모 border-l-4
              ),
        padding: date == null ? null : const EdgeInsets.only(left: 8), // 데모 pl-2
        child: date == null
            ? const SizedBox()
            : Column(children: [
                Text('${date!.month}월', style: TextStyle(fontSize: 12, color: color)),
                Text('${date!.day}',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: color,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    )),
                Text('(${_weekdayKo(date!)})', style: TextStyle(fontSize: 11, color: color)),
              ]),
      );
}

/// 상태 배지 — 글자만(배경 없음). 완료=딥틸, 나머지=회색(HIST-ROW-13).
class VisitBadge extends StatelessWidget {
  const VisitBadge({super.key, required this.status});
  final VisitStatus status;
  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (status) {
      VisitStatus.done => ('진료 완료', AppTokens.primary),
      VisitStatus.cancelled => ('취소됨', AppTokens.grayDone),
      VisitStatus.noShow => ('방문하지 않음', AppTokens.grayDone),
      VisitStatus.unconfirmed => ('확정되지 않음', AppTokens.grayDone),
    };
    return Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w700));
  }
}

/// 지나간 예약 한 줄 — 접힌 모습 + 펼침 슬롯. detail은 T27b가 실제 위젯을 주입한다(양방향 악수).
class HistoryRow extends StatelessWidget {
  const HistoryRow({super.key, required this.entry, required this.expanded, required this.onToggle, required this.detail});
  final VisitHistoryEntry entry;
  final bool expanded;
  final VoidCallback onToggle;
  final Widget detail; // ⭐ 펼침 슬롯 — T27a는 빈 상자, T27b가 알맹이
  @override
  Widget build(BuildContext context) {
    final struck = entry.status == VisitStatus.cancelled; // HIST-ROW-04: 취소만 취소선
    final railColor = (entry.status == VisitStatus.done && (entry.patientVisibleNotes ?? '').isNotEmpty)
        ? AppTokens.primary
        : AppTokens.grayPending; // HIST-LIST-05·06
    // 데모(History.tsx `<Card>`)처럼 각 줄을 흰 카드로 — 그림자는 바깥 Container(안쪽에 두면
    // 카드 사각형에 잘려 "각진 네모/단절"로 보인다 — booking_widgets 구조와 동일).
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6), // 데모 space-y-3
      child: Container(
        decoration: BoxDecoration(
          color: AppTokens.surface,
          borderRadius: BorderRadius.circular(14),
          boxShadow: AppTokens.cardElevation,
        ),
        child: Material(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(14),
          clipBehavior: Clip.antiAlias,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            InkWell(
              onTap: onToggle, // HIST-LIST-08: 누르면 펼침(이동 없음)
              child: Padding(
                padding: const EdgeInsets.all(16), // 데모 p-4
                child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
                  DateRail(date: entry.slotDate, color: railColor),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('${entry.departmentName} · ${entry.doctorName}',
                          key: const Key('history-row-title'),
                          style: TextStyle(
                              fontWeight: FontWeight.w600,
                              decoration: struck ? TextDecoration.lineThrough : null)), // HIST-ROW-04
                      if (entry.status == VisitStatus.cancelled) ...[
                        Text('취소됨 · ${_cancelActorText(entry)}',
                            style: const TextStyle(fontSize: 13, color: AppTokens.grayDone)), // HIST-ROW-02
                        if (entry.cancelledAt != null)
                          Text(_cancelDateTime(entry.cancelledAt!),
                              style: const TextStyle(fontSize: 13, color: AppTokens.grayDone)), // HIST-ROW-03
                      ],
                      if (entry.status == VisitStatus.unconfirmed)
                        const Text('병원에서 확정하지 않아 진료가 진행되지 않았습니다',
                            style: TextStyle(fontSize: 13, color: AppTokens.grayDone)), // HIST-ROW-11
                    ]),
                  ),
                  const SizedBox(width: 8),
                  VisitBadge(status: entry.status), // HIST-LIST-07 오른쪽 배지
                  const SizedBox(width: 6),
                  // 펼침 affordance(데모 ChevronDown) — 배지 위치 규칙(HIST-LIST-07) 유지하며 오른쪽에 덧댐.
                  AnimatedRotation(
                    turns: expanded ? 0.5 : 0,
                    duration: const Duration(milliseconds: 150),
                    child: const Icon(Icons.expand_more, size: 20, color: AppTokens.primary),
                  ),
                ]),
              ),
            ),
            if (expanded) // T27b가 채운다(HIST-NOTE·HIST-QNR) — 데모처럼 border-t로 구분
              Container(
                width: double.infinity,
                decoration: const BoxDecoration(
                  border: Border(top: BorderSide(color: AppTokens.border)),
                ),
                padding: const EdgeInsets.only(top: 8),
                child: detail,
              ),
          ]),
        ),
      ),
    );
  }
}

/// ⭐ 양방향 악수 갚음(T27b): T27a는 빈 상자였다 — 이제 안내문+문진 알맹이를 돌려준다.
Widget historyDetailBuilder(VisitHistoryEntry e) => HistoryRowDetail(entry: e);

/// 이력 탭. 칩으로 사람 하나 골라 그 사람의 지나간 예약 전체를 본다(HIST-ROLE-01).
class HistoryScreen extends ConsumerStatefulWidget {
  const HistoryScreen({super.key, this.deepLinkAppointment});
  final String? deepLinkAppointment; // NAV-HIST-05·06: 알림이 넘긴 예약 id(?appointment=)
  @override
  ConsumerState<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends ConsumerState<HistoryScreen> {
  final _scroll = ScrollController();
  final Set<String> _expanded = {}; // 펼친 줄 id(여러 개 가능 — HIST-LIST-10)
  final Map<int, GlobalKey> _yearKeys = {}; // 연도 헤더 위치(연도 바로가기 스크롤 대상)

  // UI-HISTORY(데모 A-2 대비): 연도 칩을 누르면 그 해 헤더로 부드럽게 스크롤한다.
  void _jumpToYear(int year) {
    final ctx = _yearKeys[year]?.currentContext;
    if (ctx == null) return; // 아직 안 불러온 해면 칩 자체가 없다
    Scrollable.ensureVisible(ctx,
        duration: const Duration(milliseconds: 300), alignment: 0.0);
  }

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_maybeLoadMore);
    if (widget.deepLinkAppointment != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _handleDeepLink());
    }
  }

  /// 알림 딥링크(?appointment=)엔 patient가 없다 → 상세로 소유자를 찾아 그 칩을 고르고 그 줄을 편다.
  /// 못 찾으면(가족 연결 해제·지워짐) 안내 팝업 + 알림은 목록에 남긴다(NAV-HIST-05·06·07).
  Future<void> _handleDeepLink() async {
    final apptId = widget.deepLinkAppointment;
    if (apptId == null) return;
    final detail = await ref.read(appointmentDetailProvider(apptId).future).catchError((_) => null);
    final owner = detail?.forPatientId;
    final chips = ref.read(historyChipsProvider).valueOrNull ?? [];
    if (owner == null || !chips.any((m) => m.id == owner)) {
      if (mounted) showNotificationGoneDialog(context); // NAV-HIST-07(B-12) — 이동 안 함
      return;
    }
    ref.read(selectedHistoryPatientProvider.notifier).state = owner; // 그 사람 칩 선택(HIST-WHO-08)
    HistoryState? page;
    try {
      page = await ref.read(historyProvider.future); // 그 사람 이력 로드
    } catch (_) {
      page = null;
    }
    if (page == null || page.items.every((e) => e.id != apptId)) {
      if (mounted) showNotificationGoneDialog(context); // 로드했는데 그 줄이 없다 → NAV-HIST-07
      return;
    }
    if (mounted) setState(() => _expanded.add(apptId)); // 그 줄 펼침(완료면 안내문이 그 안 — NAV-HIST-06)
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _maybeLoadMore() {
    // 끝 가까우면 다음 20건(HIST-LIST-16)
    if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 400) {
      ref.read(historyProvider.notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final chips = ref.watch(historyChipsProvider);
    final selfId = chips.valueOrNull?.where((m) => m.isSelf).map((m) => m.id).firstOrNull;
    final selected = ref.watch(selectedHistoryPatientProvider) ?? selfId; // HIST-WHO-03: 기본 본인
    ref.listen(selectedHistoryPatientProvider, (_, __) => setState(_expanded.clear)); // HIST-LIST-11 재진입 접힘
    final page = ref.watch(historyProvider);
    return Scaffold(
      appBar: PatientAppBar(title: '이력', icon: Icons.history), // HIST-ROLE-02: 「이력」(「방문 이력」 아님)
      body: Column(children: [
        chips.when(
          data: (ms) => NameChips(
              members: ms,
              selectedId: selected,
              onSelect: (id) => ref.read(selectedHistoryPatientProvider.notifier).state = id), // HIST-WHO-10
          loading: () => const SizedBox(),
          error: (_, __) => const SizedBox(),
        ),
        Expanded(
          child: page.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, __) => EmptyState.offline(
                screenName: '이력', // HIST-LIST-13·14 한 벌(오프라인·조회 실패 같은 벌)
                onRetry: () => ref.read(historyProvider.notifier).reload()),
            data: (st) => st.items.isEmpty
                ? EmptyState.zero(
                    message: '아직 방문하신 기록이 없습니다', // HIST-LIST-12
                    nextAction: TextButton(
                        onPressed: () => context.go('/booking'), child: const Text('+ 진료 예약하기')))
                : ListView(controller: _scroll, children: [
                    _YearJumpBar(
                        years: _distinctYears(st.items), onJump: _jumpToYear),
                    ..._withYearHeaders(st.items), // HIST-LIST-01·02·03
                    if (st.loadingMore)
                      const Padding(padding: EdgeInsets.all(12), child: Text('◌ 불러오는 중…')), // HIST-LIST-17
                    if (st.appendError)
                      TextButton(
                          onPressed: () => ref.read(historyProvider.notifier).loadMore(),
                          child: const Text('다시 시도')), // HIST-LIST-19(기존 줄 유지)
                    if (st.next == null && !st.loadingMore && st.items.isNotEmpty)
                      const Padding(
                          padding: EdgeInsets.all(12),
                          child: Text('처음부터 모두 보여드렸습니다',
                              style: TextStyle(color: AppTokens.grayDone))), // HIST-LIST-18
                  ]),
          ),
        ),
      ]),
    );
  }

  List<Widget> _withYearHeaders(List<VisitHistoryEntry> items) {
    final out = <Widget>[];
    int? lastYear;
    for (final e in items) {
      // 최신 위(서버가 이미 정렬 — HIST-LIST-01)
      final y = e.slotDate?.year;
      if (y != null && y != lastYear) {
        out.add(Padding(
          key: _yearKeys.putIfAbsent(y, () => GlobalKey()), // 연도 바로가기 스크롤 대상
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Text('$y', style: const TextStyle(fontWeight: FontWeight.w800, color: AppTokens.grayDone)),
        ));
        lastYear = y;
      }
      out.add(HistoryRow(
        entry: e,
        expanded: _expanded.contains(e.id),
        onToggle: () =>
            setState(() => _expanded.contains(e.id) ? _expanded.remove(e.id) : _expanded.add(e.id)),
        detail: KeyedSubtree(
            key: Key('history-expanded-${e.id}'), child: historyDetailBuilder(e)), // ⭐ T27a: SizedBox
      ));
    }
    return out;
  }

  // 불러온 항목에서 나타나는 해를 최신순으로(중복 제거). 연도 바로가기 칩 재료.
  List<int> _distinctYears(List<VisitHistoryEntry> items) {
    final out = <int>[];
    for (final e in items) {
      final y = e.slotDate?.year;
      if (y != null && !out.contains(y)) out.add(y);
    }
    return out;
  }
}

/// UI-HISTORY(데모 A-2 대비) — 연도 바로가기 칩 줄. 해가 둘 이상일 때만 보인다.
/// 규칙서엔 헤더(HIST-LIST-02)만 있고 이 편의는 데모 방향 리스킨으로 더한 것.
class _YearJumpBar extends StatelessWidget {
  const _YearJumpBar({required this.years, required this.onJump});
  final List<int> years;
  final void Function(int) onJump;

  @override
  Widget build(BuildContext context) {
    if (years.length < 2) return const SizedBox.shrink(); // 한 해뿐이면 군더더기
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (final y in years)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ActionChip(
                  key: Key('year-jump-$y'),
                  label: Text('$y년'),
                  onPressed: () => onJump(y),
                  backgroundColor: AppTokens.surface,
                  side: const BorderSide(color: AppTokens.border),
                  labelStyle: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w600, color: AppTokens.primary),
                  visualDensity: VisualDensity.compact,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
