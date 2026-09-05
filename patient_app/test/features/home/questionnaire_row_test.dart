import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/home/questionnaire_row.dart';

Widget _wrap(Widget c) => MaterialApp(home: Scaffold(body: c));

void main() {
  testWidgets('[CARD-QNR-01] 미작성이면 사전문진 미작성 · 작성하기', (t) async {
    await t.pumpWidget(_wrap(const QuestionnaireRow(state: QnrRowState.todo)));
    expect(find.textContaining('사전문진 미작성'), findsOneWidget);
    expect(find.textContaining('작성하기'), findsOneWidget);
  });
  testWidgets('[CARD-QNR-02] 작성완료면 회색 + 수정하기(카드는 목록과 달리 줄을 남긴다)', (t) async {
    await t.pumpWidget(_wrap(const QuestionnaireRow(state: QnrRowState.done)));
    expect(find.textContaining('작성완료'), findsOneWidget);
    expect(find.textContaining('수정하기'), findsOneWidget);
  });
  testWidgets('[LIST-QNR-03] 작성 중이면 진행률과 이어서 쓰기', (t) async {
    await t.pumpWidget(
        _wrap(const QuestionnaireRow(state: QnrRowState.inProgress, answered: 3, total: 8)));
    expect(find.textContaining('작성 중 (3/8)'), findsOneWidget);
    expect(find.textContaining('이어서 쓰기'), findsOneWidget);
  });
  testWidgets('[CARD-QNR-03] 진료중 이후면 자물쇠 + 수정할 수 없습니다 · 내용 보기', (t) async {
    await t.pumpWidget(_wrap(const QuestionnaireRow(state: QnrRowState.locked)));
    expect(find.byIcon(AppIcons.lock), findsOneWidget);
    expect(find.textContaining('수정할 수 없습니다'), findsOneWidget);
    expect(find.textContaining('내용 보기'), findsOneWidget);
  });
  testWidgets('[CARD-QNR-04] 완료·이력이면 눈 + 내가 작성한 사전문진 보기', (t) async {
    await t.pumpWidget(_wrap(const QuestionnaireRow(state: QnrRowState.readonly)));
    expect(find.byIcon(AppIcons.visibility), findsOneWidget);
    expect(find.textContaining('내가 작성한 사전문진 보기'), findsOneWidget);
  });

  // ── 갭 #50: 홈 줄 상태는 questionnaire_state(제출 여부)를 쓴다 — 행 존재로 판정하지 않는다 ──
  group('[QNR-PROG-07][갭 #50] resolveQnrRow는 서버 questionnaire_state를 쓴다', () {
    test('작성 중이면 inProgress — 1문항만 써도 「작성완료」로 보이지 않는다', () {
      expect(resolveQnrRow('작성 중', inTreatment: false, finished: false), QnrRowState.inProgress);
    });
    test('작성완료(제출)면 done', () {
      expect(resolveQnrRow('작성완료', inTreatment: false, finished: false), QnrRowState.done);
    });
    test('미작성이면 todo', () {
      expect(resolveQnrRow('미작성', inTreatment: false, finished: false), QnrRowState.todo);
    });
    test('진료중이면 상태와 무관하게 locked(CARD-QNR-03)', () {
      expect(resolveQnrRow('작성 중', inTreatment: true, finished: false), QnrRowState.locked);
    });
    test('끝난 카드면 readonly(CARD-QNR-04)', () {
      expect(resolveQnrRow('작성완료', inTreatment: false, finished: true), QnrRowState.readonly);
    });
  });
}
