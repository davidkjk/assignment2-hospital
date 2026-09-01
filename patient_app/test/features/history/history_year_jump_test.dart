import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/family/family_repository.dart';
import 'package:hospital_patient_app/features/history/history_repository.dart';
import 'package:hospital_patient_app/features/history/history_screen.dart';

// UI-HISTORY(데모 A-2 대비) — 연도 바로가기 칩. 규칙서엔 헤더(HIST-LIST-02)만 있고 이 편의는 데모 방향 리스킨.
void main() {
  VisitHistoryEntry e(DateTime d) => VisitHistoryEntry(
        id: 'ap-${d.toIso8601String()}', status: VisitStatus.done, slotDate: d,
        departmentName: '내과', doctorName: '이의사', hasQuestionnaire: false,
        cancelledBy: null, isSelf: true);

  Widget host(List<VisitHistoryEntry> items) => ProviderScope(
        overrides: [
          familyRepositoryProvider.overrideWithValue(_ChipsRepo(
              [FamilyMember(id: 'me', name: '김순자', birthDate: '1990-01-01', gender: 'F',
                  relation: '본인', isSelf: true, canEditIdentity: true,
                  hasVisitHistory: false, phoneBorrowed: false)])),
          historyProvider.overrideWith(() => _FakeHistory(items)),
        ],
        child: const MaterialApp(home: HistoryScreen()),
      );

  testWidgets('[UI-HISTORY] 해가 둘 이상이면 연도 바로가기 칩이 각 해마다 뜬다', (t) async {
    await t.pumpWidget(host([e(DateTime(2026, 8, 3)), e(DateTime(2025, 12, 1))]));
    await t.pumpAndSettle();
    expect(find.byKey(const Key('year-jump-2026')), findsOneWidget);
    expect(find.byKey(const Key('year-jump-2025')), findsOneWidget);
  });

  testWidgets('[UI-HISTORY] 해가 하나뿐이면 연도 바로가기 칩을 감춘다', (t) async {
    await t.pumpWidget(host([e(DateTime(2026, 8, 3)), e(DateTime(2026, 6, 10))]));
    await t.pumpAndSettle();
    expect(find.byKey(const Key('year-jump-2026')), findsNothing);
  });
}

class _ChipsRepo implements FamilyRepository {
  _ChipsRepo(this.members);
  final List<FamilyMember> members;
  @override
  Future<List<FamilyMember>> list() async => members;
  @override
  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

class _FakeHistory extends HistoryNotifier {
  _FakeHistory(this.items);
  final List<VisitHistoryEntry> items;
  @override
  Future<HistoryState> build() async => HistoryState(items: items);
}
