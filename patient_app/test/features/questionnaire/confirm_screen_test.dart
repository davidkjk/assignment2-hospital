import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/features/questionnaire/questionnaire_repository.dart';
import 'package:hospital_patient_app/features/questionnaire/confirm_screen.dart';

class _FakeRepo implements QuestionnaireRepository {
  _FakeRepo(this._data);
  final QnrData _data;
  bool submitted = false;
  @override
  Future<QnrData> load(String id) async => _data;
  @override
  Future<QnrProgress> save(String id, List<Answer> a, {bool complete = false}) async {
    if (complete) submitted = true;
    return QnrProgress(state: complete ? '작성완료' : '작성 중', answered: a.length, total: _data.questions.length);
  }
}

String? _route;
Future<void> _pump(WidgetTester t,
    {bool readOnly = false, Map<String, String>? ans, String returnTo = '/home'}) async {
  final data = QnrData(id: 't1', state: '작성 중', answers: ans ?? {'q1': '170'}, questions: const [
    Question(id: 'q1', text: '키', type: '단답형', required: false),
    Question(id: 'q2', text: '증상', type: '장문형', required: true), // q2 필수·비어 있음
  ]);
  final repo = _FakeRepo(data);
  final router = GoRouter(initialLocation: '/c', routes: [
    GoRoute(
        path: '/c',
        builder: (c, s) => ConfirmScreen(appointmentId: 'appt-1', readOnly: readOnly, returnTo: returnTo)),
    GoRoute(
        path: '/questionnaire/:id',
        builder: (c, s) {
          _route = '${s.uri}';
          return const Scaffold(body: Text('문항'));
        }),
    GoRoute(
        path: '/home',
        builder: (c, s) {
          _route = '/home';
          return const Scaffold(body: Text('홈'));
        }),
    GoRoute(
        path: '/appointments/appt-1',
        builder: (c, s) {
          _route = '/appointments/appt-1';
          return const Scaffold(body: Text('상세'));
        }),
  ]);
  await t.pumpWidget(ProviderScope(
      overrides: [questionnaireRepositoryProvider.overrideWithValue(repo)],
      child: MaterialApp.router(routerConfig: router)));
  await t.pumpAndSettle();
  addTearDown(() => _route = null);
}

void main() {
  testWidgets('[NAV-QNR-14] 항목별 [고치기] → 그 문항으로(1번부터 다시 안 훑음)', (t) async {
    await _pump(t);
    await t.tap(find.byKey(const Key('edit-q2'))); // 2번 고치기
    await t.pumpAndSettle();
    expect(_route, contains('start=1')); // 2번(index 1)으로 바로
  });

  testWidgets('[NAV-QNR-15] [제출하기] → 왔던 곳으로 돌아간다(홈에서 왔으면 홈)', (t) async {
    await _pump(t, returnTo: '/home');
    await t.tap(find.text('제출하기'));
    await t.pumpAndSettle();
    expect(_route, '/home');
  });

  testWidgets('[NAV-QNR-15] 예약 상세에서 왔으면 제출 후 상세로 돌아간다', (t) async {
    await _pump(t, returnTo: '/appointments/appt-1');
    await t.tap(find.text('제출하기'));
    await t.pumpAndSettle();
    expect(_route, '/appointments/appt-1');
  });

  testWidgets('[QNR-REQ-02] 필수 문항(q2)이 비어 있어도 제출된다(막지도 경고도 안 함)', (t) async {
    await _pump(t, ans: {'q1': '170'}); // q2(필수) 비어 있음
    expect(find.textContaining('필수 항목'), findsNothing); // 경고를 세우지 않는다
    await t.tap(find.text('제출하기'));
    await t.pumpAndSettle();
    expect(_route, '/home'); // 그대로 제출·복귀
  });

  testWidgets('[QNR-REQ-02] readOnly면 [고치기]·[제출하기]가 없다(읽기전용 렌더는 T24)', (t) async {
    await _pump(t, readOnly: true);
    expect(find.text('제출하기'), findsNothing);
    expect(find.byKey(const Key('edit-q2')), findsNothing);
  });
}
