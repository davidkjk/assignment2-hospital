import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/appointment/appointment_detail.dart';
import 'package:hospital_patient_app/features/questionnaire/questionnaire_repository.dart';
import 'package:hospital_patient_app/features/questionnaire/questionnaire_entry.dart';
import '../appointment/harness.dart' show detail; // 실제 AppointmentDetail 픽스처(status만 씀)

class _FakeRepo implements QuestionnaireRepository {
  _FakeRepo(this._data);
  final QnrData _data;
  @override
  Future<QnrData> load(String id) async => _data;
  @override
  Future<QnrProgress> save(String id, List<Answer> a, {bool complete = false}) async =>
      QnrProgress(state: '작성 중', answered: a.length, total: _data.questions.length);
}

QnrData _data({String state = '미작성', int n = 3, Map<String, String>? ans}) => QnrData(
    id: 't1',
    state: state,
    answers: ans ?? {},
    questions: [for (var i = 1; i <= n; i++) Question(id: 'q$i', text: '문항 $i', type: '단답형', required: false)]);

String? _route;
Future<void> _pump(WidgetTester t,
    {required QnrData data, String status = '예약확정', String? from}) async {
  final uri = from == null ? '/questionnaire/appt-1' : '/questionnaire/appt-1?from=$from';
  final router = GoRouter(initialLocation: uri, routes: [
    GoRoute(
        path: '/questionnaire/:id',
        builder: (c, s) => QuestionnaireEntry(appointmentId: s.pathParameters['id']!)),
    GoRoute(
        path: '/home',
        builder: (c, s) {
          _route = '/home';
          return const Scaffold(body: Text('홈'));
        }),
  ]);
  await t.pumpWidget(ProviderScope(overrides: [
    questionnaireRepositoryProvider.overrideWithValue(_FakeRepo(data)),
    appointmentDetailProvider('appt-1').overrideWith((ref) async => detail(status: status)),
  ], child: MaterialApp.router(theme: AppTheme.theme, routerConfig: router)));
  await t.pump();
  await t.pump();
  addTearDown(() => _route = null);
}

void main() {
  testWidgets('[NAV-QNR-01] 미작성 진입 → 마법사 1번 문항', (t) async {
    await _pump(t, data: _data(state: '미작성'));
    expect(find.text('문항 1'), findsOneWidget);
  });

  testWidgets('[NAV-QNR-02] 작성 중 진입 → 이어쓰기 화면', (t) async {
    await _pump(t, data: _data(state: '작성 중', ans: {'q1': 'a'}));
    expect(find.textContaining('이어서'), findsWidgets);
  });

  testWidgets('[NAV-QNR-03] 작성완료 진입 → 확인 화면(수정 가능, 1번부터 다시 안 넘김)', (t) async {
    await _pump(t, data: _data(state: '작성완료', ans: {'q1': 'a', 'q2': 'b', 'q3': 'c'}));
    expect(find.text('제출하기'), findsOneWidget); // 확인 화면(수정 모드)
    expect(find.byKey(const Key('edit-q1')), findsOneWidget);
  });

  testWidgets('[NAV-QNR-04] 예약이 읽기전용 상태(진료중)면 읽기전용 확인 화면', (t) async {
    await _pump(t, data: _data(state: '작성완료', ans: {'q1': 'a'}), status: '진료중');
    expect(find.text('제출하기'), findsNothing); // readOnly
    expect(find.byKey(const Key('edit-q1')), findsNothing);
  });

  testWidgets('[NAV-QNR-10] 이력에서 온 완료된 문진(진료완료)도 읽기전용 확인', (t) async {
    await _pump(t, data: _data(state: '작성완료', ans: {'q1': 'a'}), status: '진료완료', from: 'history');
    expect(find.text('제출하기'), findsNothing);
  });

  testWidgets('[NAV-QNR-05][NAV-QNR-06] 예약 완료에서 왔으면(from=booking) 마법사 1번', (t) async {
    await _pump(t, data: _data(state: '미작성'), from: 'booking');
    expect(find.text('문항 1'), findsOneWidget);
  });

  test('[NAV-QNR-07] 예약 상세에서 왔으면(from=detail) 뒤로 갈 곳이 상세', () {
    expect(returnRouteFor('detail', 'appt-1'), '/appointments/appt-1'); // NAV-QNR-07·15
  });

  test('[NAV-QNR-08] 알림함에서 왔으면(from=noti) 뒤로 갈 곳이 알림함', () {
    expect(returnRouteFor('noti', 'appt-1'), '/notifications');
  });

  test('[NAV-QNR-09] 푸시에서 왔으면(from=push) 뒤로 갈 곳이 홈', () {
    expect(returnRouteFor('push', 'appt-1'), '/home');
  });

  testWidgets('[NAV-QNR-19][QNR-FORM-06][QNR-FORM-07] 0문항+답없음 = 들어올 길 없음 → 홈으로 돌린다', (t) async {
    await _pump(t, data: _data(state: '미작성', n: 0));
    await t.pumpAndSettle();
    expect(_route, '/home'); // 문진 줄이 없어 진입 방어
  });

  testWidgets('[QNR-FORM-06b] 0문항이어도 쓴 답이 있으면 읽기전용 조회는 남는다', (t) async {
    await _pump(t,
        data: const QnrData(id: 't1', state: '작성완료', questions: [], answers: {'q1': '옛 답'}),
        status: '진료완료');
    expect(find.text('제출하기'), findsNothing); // 읽기전용 조회
    expect(find.text('옛 답'), findsOneWidget);
  });

  testWidgets('[NAV-QNR-18] 작성 중 그 예약이 취소돼도 화면을 옮기지 않는다(라우트 유지)', (t) async {
    await _pump(t, data: _data(state: '작성 중', ans: {'q1': 'a'}), status: '취소');
    expect(_route, isNot('/home')); // 다른 화면으로 튕기지 않는다
  });
}
