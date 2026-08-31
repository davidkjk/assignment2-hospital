import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/core/theme.dart';
import 'package:hospital_patient_app/features/questionnaire/questionnaire_repository.dart';
import 'package:hospital_patient_app/features/questionnaire/questionnaire_controller.dart';
import 'package:hospital_patient_app/features/questionnaire/questionnaire_wizard.dart';
import 'package:hospital_patient_app/features/questionnaire/resume_screen.dart';
import 'package:hospital_patient_app/features/questionnaire/confirm_screen.dart';

// 데모(demo/src/routes/patient/questionnaire/Questionnaire.tsx)와 눈대조하는 골든.
// 판정값은 fixture가 주입한다 — 화면은 그리기만 한다.
class _FakeRepo implements QuestionnaireRepository {
  _FakeRepo(this._data);
  final QnrData _data;
  @override
  Future<QnrData> load(String id) async => _data;
  @override
  Future<QnrProgress> save(String id, List<Answer> a, {bool complete = false}) async =>
      QnrProgress(state: complete ? '작성완료' : '작성 중', answered: a.length, total: _data.questions.length);
}

Future<void> _pump(WidgetTester t, Widget screen, QnrData data, {int start = 0}) async {
  await t.binding.setSurfaceSize(const Size(390, 844));
  addTearDown(() => t.binding.setSurfaceSize(null));
  // 화면 내부의 context.go 목적지들을 흡수하는 최소 라우터.
  final router = GoRouter(initialLocation: '/s', routes: [
    GoRoute(path: '/s', builder: (c, s) => screen),
    GoRoute(path: '/questionnaire/:id', builder: (c, s) => const Scaffold(body: SizedBox())),
    GoRoute(path: '/home', builder: (c, s) => const Scaffold(body: SizedBox())),
  ]);
  await t.pumpWidget(ProviderScope(
      overrides: [questionnaireRepositoryProvider.overrideWithValue(_FakeRepo(data))],
      child: MaterialApp.router(theme: AppTheme.theme, routerConfig: router)));
  await t.pump();
  await t.pump();
}

QnrData _mixed({String state = '미작성', Map<String, String>? ans}) => QnrData(
      id: 't1',
      state: state,
      answers: ans ?? {},
      questions: const [
        Question(id: 'q1', text: '현재 복용 중인 약이 있으신가요?', type: '예/아니오', required: true),
        Question(id: 'q2', text: '오늘 병원을 찾으신 증상을 자유롭게 적어 주세요.', type: '장문형', required: true),
        Question(id: 'q3', text: '키(cm)를 알려 주세요.', type: '단답형', required: false),
      ]);

void main() {
  testWidgets('golden: 마법사 — 장문형 문항 + 필수 배지', (t) async {
    await _pump(
        t, const QuestionnaireWizard(appointmentId: 'a1', startIndex: 1), _mixed(state: '작성 중', ans: {'q1': '예'}));
    await expectLater(
        find.byType(QuestionnaireWizard), matchesGoldenFile('goldens/qnr-wizard-longtext.png'));
  });

  testWidgets('golden: 마법사 — 예/아니오 큰 버튼', (t) async {
    await _pump(t, const QuestionnaireWizard(appointmentId: 'a1', startIndex: 0), _mixed());
    await expectLater(find.byType(QuestionnaireWizard), matchesGoldenFile('goldens/qnr-wizard-yesno.png'));
  });

  testWidgets('golden: 이어쓰기 화면', (t) async {
    await _pump(t, const ResumeScreen(appointmentId: 'a1'), _mixed(state: '작성 중', ans: {'q1': '예'}));
    await expectLater(find.byType(ResumeScreen), matchesGoldenFile('goldens/qnr-resume.png'));
  });

  testWidgets('golden: 확인 화면(수정 모드)', (t) async {
    await _pump(t, const ConfirmScreen(appointmentId: 'a1', returnTo: '/home'),
        _mixed(state: '작성완료', ans: {'q1': '예', 'q2': '어제부터 오른쪽 무릎이 아픕니다.', 'q3': '172'}));
    await expectLater(find.byType(ConfirmScreen), matchesGoldenFile('goldens/qnr-confirm.png'));
  });
}
