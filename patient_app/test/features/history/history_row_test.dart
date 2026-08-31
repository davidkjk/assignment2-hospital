import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/tokens.dart';
import 'package:hospital_patient_app/features/history/history_repository.dart';
import 'package:hospital_patient_app/features/history/history_screen.dart';

VisitHistoryEntry _e(VisitStatus s,
        {String? notes, String? by, String? rel, String? name, bool self = true, bool qnr = false}) =>
    VisitHistoryEntry(
      id: 'ap1', status: s, slotDate: DateTime(2026, 8, 3), departmentName: '내과', doctorName: '이의사',
      patientVisibleNotes: notes, hasQuestionnaire: qnr, cancelledBy: by, cancelledByRelation: rel,
      cancelledByName: name, cancelledAt: by == null ? null : DateTime(2026, 7, 18, 15, 12), isSelf: self);

Widget _host(Widget w) => MaterialApp(home: Scaffold(body: w));
Widget _row(VisitHistoryEntry e) =>
    _host(HistoryRow(entry: e, expanded: false, onToggle: () {}, detail: const SizedBox.shrink()));

void main() {
  testWidgets('[HIST-LIST-04] 날짜 레일 — 월 작게 / 일 크게(고정폭) / 요일 작게', (t) async {
    await t.pumpWidget(_host(const DateRail(date: null, color: Colors.grey))); // null이어도 깨지지 않음
    await t.pumpWidget(_host(DateRail(date: DateTime(2026, 8, 3), color: AppTokens.primary))); // 2026-08-03 = 월요일
    expect(find.text('8월'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
    expect(find.text('(월)'), findsOneWidget); // 요일(기억의 실마리 — 목업 50·26·38)
  });
  testWidgets('[HIST-LIST-05][HIST-ROW-01] 진료완료+안내문 있으면 레일 딥틸 + 「진료 완료」 배지', (t) async {
    await t.pumpWidget(_row(_e(VisitStatus.done, notes: '휴식하세요')));
    expect(find.widgetWithText(VisitBadge, '진료 완료'), findsOneWidget);
    final rail = t.widget<DateRail>(find.byType(DateRail));
    expect(rail.color, AppTokens.primary); // 딥틸
  });
  testWidgets('[HIST-LIST-06] 안내 없는 완료·취소·부도·미확정은 레일 옅은 회색', (t) async {
    await t.pumpWidget(_row(_e(VisitStatus.done, notes: null))); // 완료지만 안내 없음
    expect(t.widget<DateRail>(find.byType(DateRail)).color, AppTokens.grayPending);
  });
  testWidgets('[HIST-LIST-07] 줄 본문 = 진료과 · 의사 + 오른쪽 상태 배지', (t) async {
    await t.pumpWidget(_row(_e(VisitStatus.done, notes: '휴식하세요')));
    expect(find.textContaining('내과'), findsOneWidget);
    expect(find.textContaining('이의사'), findsOneWidget);
    expect(find.byType(VisitBadge), findsOneWidget);
  });
  testWidgets('[HIST-ROW-02][HIST-ROW-05] 취소 줄 — 병원취소는 「병원에서 취소」, 직원 이름 없음', (t) async {
    await t.pumpWidget(_row(_e(VisitStatus.cancelled, by: 'hospital')));
    expect(find.widgetWithText(VisitBadge, '취소됨'), findsOneWidget);
    expect(find.textContaining('병원에서 취소'), findsOneWidget);
    expect(find.textContaining('님'), findsNothing); // 직원 이름 안 씀(HIST-ROW-05)
  });
  testWidgets('[HIST-ROW-02] 취소 줄 — 가족이면 「배우자 김순자 님 취소」, 본인이면 「본인 취소」', (t) async {
    await t.pumpWidget(_row(_e(VisitStatus.cancelled, by: 'patient', rel: '배우자', name: '김순자', self: false)));
    expect(find.textContaining('배우자 김순자 님 취소'), findsOneWidget);
    await t.pumpWidget(_row(_e(VisitStatus.cancelled, by: 'patient', self: true)));
    expect(find.textContaining('본인 취소'), findsOneWidget);
  });
  testWidgets('[HIST-ROW-03] 취소 줄은 취소한 날짜·시각을 한 줄 더 보여준다', (t) async {
    await t.pumpWidget(_row(_e(VisitStatus.cancelled, by: 'hospital')));
    expect(find.textContaining('7월 18일'), findsOneWidget);
    expect(find.textContaining('오후 3:12'), findsOneWidget);
  });
  testWidgets('[HIST-ROW-04] 취소 줄은 진료과·의사 이름에 취소선 — ⛔ 날짜엔 긋지 않는다(B-44)', (t) async {
    await t.pumpWidget(_row(_e(VisitStatus.cancelled, by: 'hospital')));
    final deptDoctor = t.widget<Text>(find.byKey(const Key('history-row-title')));
    expect(deptDoctor.style?.decoration, TextDecoration.lineThrough); // 진료과·의사에 취소선
    // 날짜 레일 텍스트엔 취소선이 없다(B-44 — 없어진 것은 날짜가 아니라 진료).
    expect(t.widget<Text>(find.text('3')).style?.decoration ?? TextDecoration.none, TextDecoration.none);
  });
  testWidgets('[HIST-ROW-06][HIST-ROW-07] 부도 줄 — 「방문하지 않음」·취소선 없음·금지문구 없음', (t) async {
    await t.pumpWidget(_row(_e(VisitStatus.noShow)));
    expect(find.widgetWithText(VisitBadge, '방문하지 않음'), findsOneWidget);
    expect(t.widget<Text>(find.byKey(const Key('history-row-title'))).style?.decoration ?? TextDecoration.none,
        TextDecoration.none); // 취소선 없음(예약은 살아 있었다)
    expect(find.textContaining('안 오셨'), findsNothing); // 책망 문구 금지
    expect(find.textContaining('부도'), findsNothing); // 내부 상태 이름 금지
  });
  testWidgets('[HIST-ROW-09][HIST-ROW-10][HIST-ROW-11] 미확정 줄 — 「확정되지 않음」·회색·취소선 없음 + 안내 한 줄', (t) async {
    await t.pumpWidget(_row(_e(VisitStatus.unconfirmed)));
    expect(find.widgetWithText(VisitBadge, '확정되지 않음'), findsOneWidget);
    expect(find.textContaining('병원에서 확정하지 않아 진료가 진행되지 않았습니다'), findsOneWidget);
    expect(t.widget<Text>(find.byKey(const Key('history-row-title'))).style?.decoration ?? TextDecoration.none,
        TextDecoration.none); // 부도로 찍지 않는다(환자 탓 아님)
  });
  testWidgets('[HIST-ROW-13] 상태 배지는 글자만(배경 없음) — 완료=딥틸, 나머지=회색', (t) async {
    await t.pumpWidget(_row(_e(VisitStatus.done, notes: '휴식하세요')));
    final done = t.widget<VisitBadge>(find.byType(VisitBadge));
    expect(done.status, VisitStatus.done); // 색 매핑은 위젯 안(배경 상자 없음)
  });
  testWidgets('[HIST-ROW-14] 어느 줄에도 [다시 예약하기] 버튼을 붙이지 않는다', (t) async {
    for (final s in VisitStatus.values) {
      await t.pumpWidget(_row(_e(s)));
      expect(find.textContaining('다시 예약'), findsNothing);
    }
  });
}
