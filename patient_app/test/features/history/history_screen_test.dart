// HistoryScreen을 ProviderScope로 감싸 historyChipsProvider·historyProvider·connectivityProvider를 주입해 검증.
// (T25 harness 골격 — familyRepositoryProvider로 칩을, historyProvider를 가짜 AsyncNotifier로 채운다.)
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/family/family_repository.dart';
import 'package:hospital_patient_app/features/history/history_repository.dart';
import 'package:hospital_patient_app/features/history/history_screen.dart';

VisitHistoryEntry _e(VisitStatus s, DateTime d, {bool qnr = false}) => VisitHistoryEntry(
      id: 'ap-${d.toIso8601String()}', status: s, slotDate: d, departmentName: '내과', doctorName: '이의사',
      patientVisibleNotes: s == VisitStatus.done ? '휴식하세요' : null, hasQuestionnaire: qnr, isSelf: true);

FamilyMember _fm(String id, String name, {bool self = false}) => FamilyMember(
      id: id, name: name, birthDate: '1990-01-01', gender: 'F', relation: self ? '본인' : '자녀',
      isSelf: self, canEditIdentity: true, hasVisitHistory: false, phoneBorrowed: false);

/// 칩만 내려주는 최소 가족 리포지토리(나머지 메서드는 안 쓴다).
class _ChipsRepo implements FamilyRepository {
  _ChipsRepo(this.members);
  final List<FamilyMember> members;
  @override
  Future<List<FamilyMember>> list() async => members;
  @override
  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

/// 이력 페이지 상태를 통째로 주입하는 가짜 — 서버 판정값은 fixture가 이미 싣고 온다.
class _FakeHistory extends HistoryNotifier {
  _FakeHistory(this.items,
      {this.nextCursor, this.online = true, this.appendFails = false, this.startAppendError = false});
  final List<VisitHistoryEntry> items;
  final String? nextCursor;
  final bool online, appendFails, startAppendError;

  @override
  Future<HistoryState> build() async {
    if (!online) throw Exception('offline'); // 이력은 캐시 안 함(OFF-CACHE-03) → 오프라인=조회 실패
    return HistoryState(items: items, next: nextCursor, appendError: startAppendError);
  }

  @override
  Future<void> loadMore() async {
    final cur = state.valueOrNull;
    if (cur == null || cur.next == null || cur.loadingMore) return;
    if (appendFails) {
      state = AsyncData(HistoryState(items: cur.items, next: cur.next, appendError: true)); // HIST-LIST-19
    } else {
      state = AsyncData(HistoryState(items: cur.items, next: null)); // 다 받음 → HIST-LIST-18
    }
  }

  @override
  Future<void> reload() async {
    state = await AsyncValue.guard(build);
  }
}

Future<void> _pump(
  WidgetTester t, {
  required List<VisitHistoryEntry> items,
  String? nextCursor,
  bool online = true,
  bool appendFails = false,
  bool startAppendError = false,
  List<FamilyMember>? chips,
  String? preselect,
  Size size = const Size(390, 2600),
}) async {
  await t.binding.setSurfaceSize(size);
  addTearDown(() => t.binding.setSurfaceSize(null));
  final chipList = chips ?? [_fm('me', '김순자', self: true)];
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (c, s) => const HistoryScreen()),
    GoRoute(path: '/booking', builder: (c, s) => const Scaffold(body: Text('booking'))),
  ]);
  await t.pumpWidget(ProviderScope(
    overrides: [
      familyRepositoryProvider.overrideWithValue(_ChipsRepo(chipList)),
      historyProvider.overrideWith(() =>
          _FakeHistory(items, nextCursor: nextCursor, online: online, appendFails: appendFails, startAppendError: startAppendError)),
      if (preselect != null) selectedHistoryPatientProvider.overrideWith((ref) => preselect),
    ],
    child: MaterialApp.router(theme: AppTheme.theme, routerConfig: router),
  ));
  await t.pumpAndSettle();
}

void main() {
  testWidgets('[HIST-ROLE-01][HIST-ROLE-03] 이력 탭은 지나간 예약 전체 — 4상태를 다 그린다(진료완료만이 아니다)', (t) async {
    await _pump(t, items: [
      _e(VisitStatus.noShow, DateTime(2026, 3, 10)), _e(VisitStatus.cancelled, DateTime(2026, 2, 10)),
      _e(VisitStatus.done, DateTime(2026, 1, 10)), _e(VisitStatus.unconfirmed, DateTime(2020, 1, 1)),
    ]);
    expect(find.widgetWithText(VisitBadge, '진료 완료'), findsOneWidget);
    expect(find.widgetWithText(VisitBadge, '취소됨'), findsOneWidget);
    expect(find.widgetWithText(VisitBadge, '방문하지 않음'), findsOneWidget);
    expect(find.widgetWithText(VisitBadge, '확정되지 않음'), findsOneWidget); // HIST-ROLE-01: 다 온다
  });
  testWidgets('[HIST-ROLE-04] 앞으로 갈 예약 5종(신청·확정·도착·대기·진료중)은 이력에 오지 않는다', (t) async {
    // 서버(T8 _HISTORY_WHERE)가 진행 5종을 애초에 안 보낸다 — 화면은 그 배지 어휘를 그리지 않는다(홈·예약 탭 몫).
    await _pump(t, items: [_e(VisitStatus.done, DateTime(2026, 1, 10))]);
    for (final w in ['진료 대기', '예약 확정', '진료 중', '도착']) {
      expect(find.widgetWithText(VisitBadge, w), findsNothing);
    }
  });
  testWidgets('[HIST-WHO-08] 특정 사람으로 선택을 걸고 열면 그 사람 칩이 선택된 채 그 사람 이력이 뜬다', (t) async {
    // 알림 딥링크(NAV-HIST-05·06, T27b)가 쓰는 「칩 선택 기전」 — 여기선 provider를 걸어 그 기전만 검증한다.
    await _pump(t, chips: [_fm('me', '김순자', self: true), _fm('mom', '이영자')], preselect: 'mom',
        items: [_e(VisitStatus.done, DateTime(2026, 6, 1))]);
    final momChip = t.widget<ChoiceChip>(find.widgetWithText(ChoiceChip, '이영자'));
    expect(momChip.selected, true); // 그 사람 칩이 선택됨
    expect(find.byType(HistoryRow), findsOneWidget); // 그 사람 이력이 로드됨
  });
  testWidgets('[HIST-WHO-09] 진료과 필터 위젯을 두지 않는다(가족 전환 자리를 밀어내지 않게)', (t) async {
    await _pump(t, items: [_e(VisitStatus.done, DateTime(2026, 1, 10))]);
    expect(find.byKey(const Key('history-department-filter')), findsNothing);
    expect(find.byType(DropdownButton<String>), findsNothing); // 어떤 형태의 진료과 필터도 없다
  });
  testWidgets('[HIST-LIST-01][HIST-LIST-02][HIST-LIST-03] 최신 위 + 해 바뀌는 자리마다(올해도) 연도 헤더', (t) async {
    await _pump(t, items: [_e(VisitStatus.done, DateTime(2026, 5, 1)), _e(VisitStatus.done, DateTime(2025, 12, 1))]);
    // 2년치라 연도 바로가기 칩(_YearJumpBar)과 연도 헤더(_YearHeader)가 둘 다 'N년'으로 뜬다 → 각 2개.
    expect(find.text('2026년'), findsNWidgets(2)); // 올해에도 헤더(HIST-LIST-03) — 데모 '2026년'
    expect(find.text('2025년'), findsNWidgets(2));
  });
  testWidgets('[HIST-LIST-20] 몇 년 전 줄도 화면이 안 거르고 그린다(기간 제한 없음)', (t) async {
    await _pump(t, items: [_e(VisitStatus.done, DateTime(2018, 4, 1))]);
    expect(find.text('2018년'), findsOneWidget); // 오래돼도 막다른 길을 만들지 않는다
  });
  testWidgets('[HIST-LIST-08][HIST-LIST-10][HIST-LIST-11] 누르면 펼침 · 여러 줄 동시', (t) async {
    await _pump(t, items: [_e(VisitStatus.done, DateTime(2026, 5, 1)), _e(VisitStatus.done, DateTime(2026, 4, 1))]);
    final id1 = 'ap-${DateTime(2026, 5, 1).toIso8601String()}';
    await t.tap(find.byType(HistoryRow).first);
    await t.pump();
    expect(find.byKey(Key('history-expanded-$id1')), findsOneWidget); // 펼침 슬롯 존재(T27a=SizedBox)
    await t.tap(find.byType(HistoryRow).last);
    await t.pump(); // 두 번째도 — 첫 번째가 닫히지 않는다
    expect(find.byType(HistoryRow).evaluate().length, 2);
  });
  testWidgets('[HIST-LIST-12] 0건 — 안내 + [진료 예약하기], [다시 시도] 없음', (t) async {
    await _pump(t, items: []);
    expect(find.textContaining('아직 방문하신 기록이 없습니다'), findsOneWidget);
    expect(find.textContaining('진료 예약하기'), findsOneWidget);
    expect(find.textContaining('다시 시도'), findsNothing);
  });
  testWidgets('[HIST-LIST-13][HIST-LIST-14] 오프라인·조회 실패는 같은 한 벌 — 가운데 안내 + [다시 시도]', (t) async {
    await _pump(t, items: [], online: false);
    expect(find.textContaining('다시 시도'), findsOneWidget); // 이력은 캐시 안 함(OFF-CACHE-03)
  });
  testWidgets('[HIST-LIST-15] 20건을 한 번에 그린다', (t) async {
    await _pump(t,
        items: [for (var i = 0; i < 20; i++) _e(VisitStatus.done, DateTime(2026, 1, 1).add(Duration(days: i)))],
        nextCursor: '2025-12-31|apX', size: const Size(390, 4000)); // 다음 페이지 있음
    expect(find.byType(HistoryRow), findsNWidgets(20)); // HIST-LIST-15: 20건
    expect(find.textContaining('처음부터 모두 보여드렸습니다'), findsNothing); // 아직 끝 아님
  });
  testWidgets('[HIST-LIST-18] 끝까지 받으면 「처음부터 모두 보여드렸습니다」 한 줄', (t) async {
    await _pump(t, items: [_e(VisitStatus.done, DateTime(2026, 1, 1))], nextCursor: null);
    expect(find.textContaining('처음부터 모두 보여드렸습니다'), findsOneWidget);
  });
  testWidgets('[HIST-LIST-19] 이어받기 실패 — 맨 아래 [다시 시도], ⛔ 이미 받은 줄은 지우지 않는다', (t) async {
    // 1줄만 있으면 스크롤이 안 생겨 드래그로 loadMore를 못 부른다 → 실패 상태를 직접 주입해 렌더 계약을 검증.
    await _pump(t, items: [_e(VisitStatus.done, DateTime(2026, 1, 1))], nextCursor: 'x', startAppendError: true);
    expect(find.byType(HistoryRow), findsOneWidget); // 기존 줄 보존
    expect(find.textContaining('다시 시도'), findsOneWidget);
  });
  testWidgets('[HIST-WHO-06][HIST-WHO-07] 해제한 가족은 칩에서 사라진다(familyList가 이미 제외)', (t) async {
    // historyChipsProvider=familyListProvider가 해제자를 이미 제외(T2 갭 #61) — 칩에 안 넣는 것으로 확인.
    await _pump(t, chips: [_fm('me', '김순자', self: true), _fm('a', '김가영')],
        items: [_e(VisitStatus.done, DateTime(2026, 1, 10))]);
    expect(find.widgetWithText(ChoiceChip, '김가영'), findsOneWidget);
    expect(find.widgetWithText(ChoiceChip, '해제된사람'), findsNothing); // 목록에 없으니 칩도 없다
  });
}
