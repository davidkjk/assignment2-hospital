import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/features/questionnaire/questionnaire_repository.dart';
import 'package:hospital_patient_app/features/questionnaire/questionnaire_wizard.dart';

class _FakeRepo implements QuestionnaireRepository {
  _FakeRepo(this._data, {this.saveDelay = Duration.zero});
  final QnrData _data;
  final Duration saveDelay;
  final saved = <List<Answer>>[];
  @override
  Future<QnrData> load(String id) async => _data;
  @override
  Future<QnrProgress> save(String id, List<Answer> a, {bool complete = false}) async {
    await Future.delayed(saveDelay);
    saved.add(a);
    return QnrProgress(state: complete ? '작성완료' : '작성 중', answered: a.length, total: _data.questions.length);
  }
}

QnrData _form(int n, {Map<String, String>? ans}) => QnrData(
    id: 't1',
    state: '미작성',
    answers: ans ?? {},
    questions: [for (var i = 1; i <= n; i++) Question(id: 'q$i', text: '문항 $i', type: 'short_text', required: i == 1)]);

// 시스템 뒤로가기(안드로이드 하드웨어 back)를 시뮬레이트해 PopScope를 탄다. 마법사가 최초 라우트라
// AppBar 뒤로가기 버튼이 없어 t.pageBack()을 못 쓴다(실 진입은 push라 back 스택이 있다).
Future<void> _systemBack(WidgetTester t) => t.binding.defaultBinaryMessenger.handlePlatformMessage(
    'flutter/navigation',
    const JSONMethodCodec().encodeMethodCall(const MethodCall('popRoute')),
    (_) {});

String? _lastRoute;
Future<void> _pump(WidgetTester t, _FakeRepo repo, {int start = 0, int n = 3}) async {
  final router = GoRouter(initialLocation: '/q', routes: [
    GoRoute(path: '/q', builder: (c, s) => QuestionnaireWizard(appointmentId: 'appt-1', startIndex: start)),
    GoRoute(
        path: '/questionnaire/appt-1/confirm',
        builder: (c, s) {
          _lastRoute = '/questionnaire/appt-1/confirm';
          return const Scaffold(body: Text('확인'));
        }),
    GoRoute(
        path: '/home',
        builder: (c, s) {
          _lastRoute = '/home';
          return const Scaffold(body: Text('홈'));
        }),
  ]);
  await t.pumpWidget(ProviderScope(
      overrides: [questionnaireRepositoryProvider.overrideWithValue(repo)],
      child: MaterialApp.router(routerConfig: router)));
  await t.pumpAndSettle();
}

void main() {
  testWidgets('[QNR-REQ-01] 필수 문항을 비우고 [다음]을 눌러도 넘어간다(앱이 안 막음)', (t) async {
    final repo = _FakeRepo(_form(3)); // 1번 문항 required=true
    await _pump(t, repo);
    await t.tap(find.text('다음'));
    await t.pumpAndSettle();
    expect(find.text('문항 2'), findsOneWidget); // 비운 채로 2번으로 넘어갔다
  });

  testWidgets('[QNR-REQ-10] 비운 필수 문항은 빈 채로 자동 저장된다(막지도 경고도 안 함)', (t) async {
    final repo = _FakeRepo(_form(3));
    await _pump(t, repo);
    await t.tap(find.text('다음'));
    await t.pumpAndSettle();
    expect(repo.saved.isNotEmpty, isTrue);
    expect(find.textContaining('필수 항목'), findsNothing); // 필수 경고를 세우지 않는다
  });

  testWidgets('[NAV-QNR-13] 마지막 문항에서 [최종 확인] → 확인 화면', (t) async {
    // 데모 승: 마지막 문항의 다음 버튼은 「최종 확인」(다음 화면이 확인임을 알림).
    final repo = _FakeRepo(_form(2));
    await _pump(t, repo, start: 1, n: 2); // 2번(마지막)에서 시작
    await t.tap(find.text('최종 확인'));
    await t.pumpAndSettle();
    expect(_lastRoute, '/questionnaire/appt-1/confirm');
  });

  testWidgets('[NAV-QNR-16] 마법사 도중 뒤로 = 확인 팝업 없이 그냥 나간다(자동저장돼 잃을 것 없음)', (t) async {
    final repo = _FakeRepo(_form(3));
    await _pump(t, repo, start: 1);
    await _systemBack(t);
    await t.pumpAndSettle();
    expect(find.text('나가기'), findsNothing); // BTN-EXIT 팝업이 뜨지 않는다
  });

  testWidgets('[NAV-QNR-17] 저장 요청이 진행 중일 때 나가면 BTN-EXIT 확인 팝업', (t) async {
    final repo = _FakeRepo(_form(3), saveDelay: const Duration(seconds: 2));
    await _pump(t, repo);
    await t.enterText(find.byType(TextField), '170');
    await t.tap(find.text('다음')); // 저장 진행 중(2초) — pumpAndSettle 안 함
    await t.pump(const Duration(milliseconds: 100));
    await _systemBack(t);
    await t.pump();
    expect(find.text('나가기'), findsOneWidget); // 진행 중이라 확인 팝업(BTN-EXIT-01)
    // 팝업을 닫고 진행 중 저장 타이머(2초)를 흘려보낸다(pending timer 방지).
    await t.tap(find.text('기다리기'));
    await t.pump(const Duration(seconds: 3));
    await t.pumpAndSettle();
  });

  testWidgets('[QNR-FORM-08] 30문항이면 문항 30개를 화면 하나씩 넘긴다(진행률·이어쓰기가 중요해짐)', (t) async {
    final repo = _FakeRepo(_form(30));
    await _pump(t, repo, start: 29, n: 30);
    expect(find.text('문항 30'), findsOneWidget); // 30번째 화면까지 도달 가능
  });
}
