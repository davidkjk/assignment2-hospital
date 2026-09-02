import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/appointment/detail_sections.dart' show QnrTable;
import 'package:hospital_patient_app/features/history/history_repository.dart';
import 'package:hospital_patient_app/features/history/history_row_detail.dart';

VisitHistoryEntry _e(VisitStatus s, {String? notes, bool qnr = false}) => VisitHistoryEntry(
      id: 'ap1', status: s, slotDate: DateTime(2026, 8, 3), departmentName: '내과', doctorName: '이의사',
      patientVisibleNotes: notes, hasQuestionnaire: qnr, isSelf: true);

Widget _host(Widget w) => ProviderScope(child: MaterialApp(home: Scaffold(body: w)));

void main() {
  testWidgets('[HIST-NOTE-01] 진료완료 줄 펼침 = 그 자리에 「병원 안내」 제목 + 본문', (t) async {
    await t.pumpWidget(_host(HistoryRowDetail(entry: _e(VisitStatus.done, notes: '이틀간 휴식하세요'))));
    expect(find.text('병원 안내'), findsOneWidget);
    expect(find.text('이틀간 휴식하세요'), findsOneWidget);
  });
  testWidgets('[HIST-NOTE-02][HIST-NOTE-03] 안내문 없으면 「안내 없음」을 명시한다(빈칸으로 두지 않는다)', (t) async {
    await t.pumpWidget(_host(HistoryRowDetail(entry: _e(VisitStatus.done, notes: null))));
    expect(find.text('안내 없음'), findsOneWidget); // 「없다」도 정보다(빈칸이면 오류로 보인다)
  });
  testWidgets('[HIST-NOTE-04] 취소·부도·미확정 줄은 안내문 자리가 아예 없다', (t) async {
    for (final s in [VisitStatus.cancelled, VisitStatus.noShow, VisitStatus.unconfirmed]) {
      await t.pumpWidget(_host(HistoryRowDetail(entry: _e(s))));
      expect(find.text('병원 안내'), findsNothing);
      expect(find.text('안내 없음'), findsNothing); // 진료를 안 받았으므로 자리 자체가 없다
    }
  });
  testWidgets('[HIST-NOTE-05][HIST-NOTE-06] 긴 안내문은 전부 편다(더 보기 없음) · 복사/공유 버튼 없음', (t) async {
    final long = '가' * 800;
    await t.pumpWidget(_host(HistoryRowDetail(entry: _e(VisitStatus.done, notes: long))));
    expect(find.text(long), findsOneWidget); // 접지 않고 통째로
    expect(find.textContaining('더 보기'), findsNothing);
    expect(find.byIcon(Icons.copy), findsNothing);
    expect(find.byIcon(Icons.share), findsNothing); // OS 기본 길게 눌러 복사만
  });
  testWidgets('[HIST-QNR-01][HIST-QNR-02] 문진 있으면 「내가 작성한 사전문진」 + 눈 아이콘', (t) async {
    await t.pumpWidget(_host(HistoryRowDetail(entry: _e(VisitStatus.done, notes: '휴식', qnr: true))));
    expect(find.text('내가 작성한 사전문진'), findsOneWidget);
    expect(find.byIcon(Icons.visibility), findsOneWidget); // 눈 = 처음부터 보기만(자물쇠 아님)
    expect(find.byIcon(Icons.lock), findsNothing);
  });
  testWidgets('[HIST-QNR-04] 미작성이었던 예약은 문진 줄 자체를 두지 않는다(「작성하지 않으셨습니다」 없음)', (t) async {
    await t.pumpWidget(_host(HistoryRowDetail(entry: _e(VisitStatus.done, notes: '휴식', qnr: false))));
    expect(find.textContaining('사전문진'), findsNothing);
    expect(find.textContaining('작성하지 않'), findsNothing);
  });
  testWidgets('[HIST-QNR-05] 취소된 예약의 문진은 「작성했던 사전문진」으로 볼 수 있다', (t) async {
    await t.pumpWidget(_host(HistoryRowDetail(entry: _e(VisitStatus.cancelled, qnr: true))));
    expect(find.text('작성했던 사전문진'), findsOneWidget); // 취소돼도 진료 참고자료라 남는다(보관)
  });
  testWidgets('[HIST-QNR-03][HIST-QNR-09] 누르면 그 자리에 문항–답변 표(읽기 전용)가 펼쳐진다 — 새 화면 안 감', (t) async {
    await t.pumpWidget(_host(HistoryRowDetail(entry: _e(VisitStatus.done, notes: '휴식', qnr: true))));
    await t.tap(find.text('내가 작성한 사전문진'));
    await t.pump();
    expect(find.byType(QnrTable), findsOneWidget); // 같은 화면 안 펼침(HIST-QNR-03)
    // 수정 버튼이 없다 = 읽기 전용(HIST-QNR-09). 「진료 전까지」는 이미 끝났다.
    expect(find.widgetWithText(ElevatedButton, '수정하기'), findsNothing);
  });
}
