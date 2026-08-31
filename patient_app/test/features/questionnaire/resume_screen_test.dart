import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/features/questionnaire/questionnaire_repository.dart';
import 'package:hospital_patient_app/features/questionnaire/resume_screen.dart';

class _FakeRepo implements QuestionnaireRepository {
  _FakeRepo(this._data);
  final QnrData _data;
  @override
  Future<QnrData> load(String id) async => _data;
  @override
  Future<QnrProgress> save(String id, List<Answer> a, {bool complete = false}) async =>
      QnrProgress(state: '작성 중', answered: a.length, total: _data.questions.length);
}

String? _route;
Future<void> _pump(WidgetTester t) async {
  // 8문항 중 3개 작성(q1·q2·q3), 첫 미작성 = index 3(4번).
  final data = QnrData(
      id: 't1',
      state: '작성 중',
      answers: {'q1': 'a', 'q2': 'b', 'q3': 'c'},
      questions: [for (var i = 1; i <= 8; i++) Question(id: 'q$i', text: '문항 $i', type: '단답형', required: false)]);
  final router = GoRouter(initialLocation: '/r', routes: [
    GoRoute(path: '/r', builder: (c, s) => const ResumeScreen(appointmentId: 'appt-1')),
    // 실제 라우트: 이어쓰기는 /questionnaire/:id?start=N으로 마법사를 그 문항에 연다.
    GoRoute(
        path: '/questionnaire/:id',
        builder: (c, s) {
          _route = '${s.uri}';
          return const Scaffold(body: Text('마법사'));
        }),
  ]);
  await t.pumpWidget(ProviderScope(
      overrides: [questionnaireRepositoryProvider.overrideWithValue(_FakeRepo(data))],
      child: MaterialApp.router(routerConfig: router)));
  await t.pumpAndSettle();
}

void main() {
  testWidgets('[NAV-QNR-11] [처음부터 보기] → 마법사 1번 문항(index 0)', (t) async {
    await _pump(t);
    await t.tap(find.text('처음부터 보기'));
    await t.pumpAndSettle();
    expect(_route, contains('start=0'));
  });

  testWidgets('[NAV-QNR-12] [이어서] → 안 쓴 첫 문항(4번 = index 3)', (t) async {
    await _pump(t);
    await t.tap(find.textContaining('이어서'));
    await t.pumpAndSettle();
    expect(_route, contains('start=3'));
  });
}
