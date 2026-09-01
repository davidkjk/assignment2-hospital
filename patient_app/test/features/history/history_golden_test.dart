import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import '../../support/golden_fonts.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/family/family_repository.dart';
import 'package:hospital_patient_app/features/history/history_repository.dart';
import 'package:hospital_patient_app/features/history/history_row_detail.dart';
import 'package:hospital_patient_app/features/history/history_screen.dart';

// Task 27a·27b 골든 게이트 — 방문 이력을 데모(settings/History.tsx)와 눈대조한다.
// ⚠️ 규칙 승(데모와 의도적 갈림, 동작·문구=규칙): ① 배지 라벨은 규칙 어휘 '방문하지 않음'·'확정되지 않음'
//    (데모 '방문 안 함'·'확정 안 됨'), 취소 주체는 배지가 아니라 하단 한 줄(HIST-ROW-02). ② 월은 레일 안
//    (HIST-LIST-04, 데모는 월 그룹 헤더로 뺌). 나머지 시각 시스템(딥틸 레일·카드·오른쪽 배지·펼침)은 데모와 정렬.
// 한글(AppleGothic) + 아이콘(MaterialIcons)을 로드해 tofu 없이 렌더한다.

void main() {
  setUpAll(() async {
    await loadGoldenFonts();
    final gothic = File('/System/Library/Fonts/Supplemental/AppleGothic.ttf');
    if (gothic.existsSync()) {
      await (FontLoader('Roboto')..addFont(Future.value(gothic.readAsBytesSync().buffer.asByteData()))).load();
    }
    final icons = File(
        '/Users/kimjunkee/dev/flutter/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf');
    if (icons.existsSync()) {
      await (FontLoader('MaterialIcons')..addFont(Future.value(icons.readAsBytesSync().buffer.asByteData()))).load();
    }
  });

  VisitHistoryEntry e(VisitStatus s, DateTime d,
          {String? notes, String? by, String? rel, String? name, bool self = true, bool qnr = false}) =>
      VisitHistoryEntry(
        id: 'ap-${d.toIso8601String()}', status: s, slotDate: d, departmentName: '내과', doctorName: '이의사',
        patientVisibleNotes: notes, hasQuestionnaire: qnr, cancelledBy: by, cancelledByRelation: rel,
        cancelledByName: name, cancelledAt: by == null ? null : DateTime(2026, 2, 5, 15, 12), isSelf: self);

  FamilyMember fm(String id, String name, {bool self = false}) => FamilyMember(
        id: id, name: name, birthDate: '1990-01-01', gender: 'F', relation: self ? '본인' : '자녀',
        isSelf: self, canEditIdentity: true, hasVisitHistory: false, phoneBorrowed: false);

  ProviderScope host(Widget child, {required List<VisitHistoryEntry> items, List<FamilyMember>? chips}) => ProviderScope(
        overrides: [
          familyRepositoryProvider.overrideWithValue(_ChipsRepo(chips ?? [fm('me', '김순자', self: true)])),
          historyProvider.overrideWith(() => _FakeHistory(items)),
        ],
        child: MaterialApp(theme: AppTheme.theme, home: child),
      );

  testWidgets('history list golden (데모 대조용) — 지나간 예약 줄 4종 + 이름 칩', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => t.binding.setSurfaceSize(null));
    final items = [
      e(VisitStatus.done, DateTime(2026, 8, 3), notes: '이틀간 충분히 휴식하세요', qnr: true),
      e(VisitStatus.cancelled, DateTime(2026, 7, 18), by: 'patient', rel: '배우자', name: '김순자', self: false),
      e(VisitStatus.noShow, DateTime(2026, 6, 10)),
      e(VisitStatus.unconfirmed, DateTime(2025, 12, 1)),
    ];
    await t.pumpWidget(host(const HistoryScreen(),
        items: items, chips: [fm('me', '김순자', self: true), fm('mom', '이영자')]));
    await t.pumpAndSettle();
    await expectLater(find.byType(HistoryScreen), matchesGoldenFile('goldens/history_list.png'));
  });

  testWidgets('history expanded golden (데모 대조용) — 병원 안내문 + 사전문진 줄', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 400));
    addTearDown(() => t.binding.setSurfaceSize(null));
    await t.pumpWidget(host(
        Scaffold(body: HistoryRowDetail(entry: e(VisitStatus.done, DateTime(2026, 8, 3), notes: '이틀간 충분히 휴식하세요', qnr: true))),
        items: const []));
    await t.pumpAndSettle();
    await expectLater(find.byType(HistoryRowDetail), matchesGoldenFile('goldens/history_expanded.png'));
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
