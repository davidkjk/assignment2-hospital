// /history?appointment= 진입 시 소유자 칩 선택 + 그 줄 펼침, 못 찾으면 GONE. + 그 자리 펼침·오프라인.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/appointment/appointment_detail.dart';
import 'package:hospital_patient_app/features/appointment/detail_sections.dart' show QnrTable;
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/family/family_repository.dart';
import 'package:hospital_patient_app/features/history/history_repository.dart';
import 'package:hospital_patient_app/features/history/history_screen.dart';

VisitHistoryEntry _e(VisitStatus s, DateTime d, {required String id, String? notes, bool qnr = false}) =>
    VisitHistoryEntry(
      id: id, status: s, slotDate: d, departmentName: '내과', doctorName: '이의사',
      patientVisibleNotes: notes, hasQuestionnaire: qnr, isSelf: true);

FamilyMember _fm(String id, String name, {bool self = false}) => FamilyMember(
      id: id, name: name, birthDate: '1990-01-01', gender: 'F', relation: self ? '본인' : '자녀',
      isSelf: self, canEditIdentity: true, hasVisitHistory: false, phoneBorrowed: false);

AppointmentView _av(String id) => AppointmentView(
    id: id, status: '진료완료', forPatientName: '이름', departmentName: '내과', doctorName: '이의사',
    hasQuestionnaire: false);

class _ChipsRepo implements FamilyRepository {
  _ChipsRepo(this.members);
  final List<FamilyMember> members;
  @override
  Future<List<FamilyMember>> list() async => members;
  @override
  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

/// 선택된 환자별 이력을 돌려주는 가짜 — 딥링크가 칩을 바꾸면 그 사람 이력으로 바뀐다.
class _FakeHistoryByPatient extends HistoryNotifier {
  _FakeHistoryByPatient(this.byPatient, this.chips, {this.online = true});
  final Map<String, List<VisitHistoryEntry>> byPatient;
  final List<FamilyMember> chips;
  final bool online;
  @override
  Future<HistoryState> build() async {
    if (!online) throw Exception('offline');
    final selfId = chips.firstWhere((m) => m.isSelf, orElse: () => chips.first).id;
    final sel = ref.watch(selectedHistoryPatientProvider) ?? selfId;
    return HistoryState(items: byPatient[sel] ?? const []);
  }
}

Future<void> _pumpDeeplink(
  WidgetTester t, {
  required String? appointment,
  String? ownerPatientId,
  required List<FamilyMember> chips,
  required Map<String, List<VisitHistoryEntry>> history,
  bool online = true,
}) async {
  await t.binding.setSurfaceSize(const Size(390, 2600));
  addTearDown(() => t.binding.setSurfaceSize(null));
  final loc = appointment == null ? '/history' : '/history?appointment=$appointment';
  final router = GoRouter(initialLocation: loc, routes: [
    GoRoute(
        path: '/history',
        builder: (c, s) => HistoryScreen(deepLinkAppointment: s.uri.queryParameters['appointment'])),
    GoRoute(path: '/booking', builder: (c, s) => const Scaffold(body: Text('booking-page'))),
  ]);
  await t.pumpWidget(ProviderScope(
    overrides: [
      familyRepositoryProvider.overrideWithValue(_ChipsRepo(chips)),
      historyProvider.overrideWith(() => _FakeHistoryByPatient(history, chips, online: online)),
      appointmentDetailProvider.overrideWith((ref, id) async =>
          ownerPatientId == null ? null : AppointmentDetail(view: _av(id), forPatientId: ownerPatientId)),
    ],
    child: MaterialApp.router(theme: AppTheme.theme, routerConfig: router),
  ));
  await t.pumpAndSettle();
}

void main() {
  testWidgets('[NAV-HIST-05][HIST-WHO-08 배선] 알림으로 들어오면 그 예약 당사자 칩이 선택되고 그 줄이 펼쳐진다', (t) async {
    await _pumpDeeplink(t, appointment: 'ap-mom', ownerPatientId: 'mom',
        chips: [_fm('me', '김순자', self: true), _fm('mom', '이영자')],
        history: {'mom': [_e(VisitStatus.cancelled, DateTime(2026, 6, 1), id: 'ap-mom')]});
    expect(t.widget<ChoiceChip>(find.widgetWithText(ChoiceChip, '이영자')).selected, true); // 그 사람 칩
    expect(find.byKey(const Key('history-expanded-ap-mom')), findsOneWidget); // 그 줄 펼침
  });
  testWidgets('[NAV-HIST-06] 진료 후 안내로 들어오면 그 줄의 안내문이 펼쳐진 상태로 열린다', (t) async {
    await _pumpDeeplink(t, appointment: 'ap1', ownerPatientId: 'me',
        chips: [_fm('me', '김순자', self: true)],
        history: {'me': [_e(VisitStatus.done, DateTime(2026, 6, 1), id: 'ap1', notes: '휴식하세요')]});
    expect(find.text('병원 안내'), findsOneWidget); // 완료 줄 펼침 = 안내문이 그 안에 있다
    expect(find.text('휴식하세요'), findsOneWidget);
  });
  testWidgets('[NAV-HIST-07] 그 줄을 찾을 수 없으면(가족 연결 해제 등) 안내 팝업 + 알림은 목록에 남긴다', (t) async {
    await _pumpDeeplink(t, appointment: 'ap-gone', ownerPatientId: 'ghost', // ghost 칩이 없다(해제됨)
        chips: [_fm('me', '김순자', self: true)], history: {'me': []});
    expect(find.byType(AlertDialog), findsOneWidget); // showNotificationGoneDialog(B-12)
  });
  testWidgets('[NAV-HIST-11][NAV-HIST-12] 오프라인 — 화면을 옮기지 않고, 이력 진입은 가운데 안내 + [다시 시도]', (t) async {
    await _pumpDeeplink(t, appointment: null, online: false,
        chips: [_fm('me', '김순자', self: true)], history: {'me': []});
    expect(find.textContaining('다시 시도'), findsOneWidget); // 이력은 캐시 안 함(OFF-CACHE-03)
  });
  testWidgets('[NAV-HIST-08] 줄 누름 = 그 자리 펼침(이동 없음)', (t) async {
    await _pumpDeeplink(t, appointment: null, chips: [_fm('me', '김순자', self: true)],
        history: {'me': [_e(VisitStatus.done, DateTime(2026, 6, 1), id: 'ap1', notes: 'x')]});
    await t.tap(find.byType(HistoryRow).first);
    await t.pump();
    expect(find.byKey(const Key('history-expanded-ap1')), findsOneWidget); // 그 자리 펼침(NAV-HIST-08)
  });
  testWidgets('[NAV-HIST-09] 이력 펼침의 「내가 작성한 사전문진」은 읽기 전용 표를 같은 화면 안에 편다', (t) async {
    await _pumpDeeplink(t, appointment: null, chips: [_fm('me', '김순자', self: true)],
        history: {'me': [_e(VisitStatus.done, DateTime(2026, 6, 1), id: 'ap1', notes: 'x', qnr: true)]});
    await t.tap(find.byType(HistoryRow).first);
    await t.pump();
    await t.tap(find.text('내가 작성한 사전문진'));
    await t.pump();
    expect(find.byType(QnrTable), findsOneWidget); // Navigator.push 없음(HIST-QNR-03)
  });
  testWidgets('[NAV-HIST-10] 이력 빈 상태 [+ 진료 예약하기] → /booking(예약 1단계)', (t) async {
    await _pumpDeeplink(t, appointment: null, chips: [_fm('me', '김순자', self: true)], history: {'me': []});
    await t.tap(find.text('+ 진료 예약하기'));
    await t.pumpAndSettle();
    expect(find.text('booking-page'), findsOneWidget); // /booking으로 이동
  });
}
