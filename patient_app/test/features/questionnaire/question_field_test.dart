import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/questionnaire/questionnaire_repository.dart';
import 'package:hospital_patient_app/features/questionnaire/question_field.dart';

Future<void> _pump(WidgetTester t, Question q, {String? value, void Function(String)? onChanged}) =>
    t.pumpWidget(MaterialApp(
        home: Scaffold(body: QuestionField(question: q, value: value, onChanged: onChanged ?? (_) {}))));

void main() {
  testWidgets('[QNR-TYPE-01] 단답형 = 한 줄 입력칸', (t) async {
    await _pump(t, const Question(id: 'q1', text: '키', type: 'short_text', required: false));
    final tf = t.widget<TextField>(find.byType(TextField));
    expect(tf.maxLines, 1);
  });

  testWidgets('[QNR-TYPE-02] 장문형 = 여러 줄 입력칸', (t) async {
    await _pump(t, const Question(id: 'q1', text: '증상', type: 'long_text', required: false));
    final tf = t.widget<TextField>(find.byType(TextField));
    expect(tf.maxLines, greaterThan(1));
  });

  testWidgets('[QNR-TYPE-03] 예/아니오 = 큰 버튼 2개(입력칸 아님)', (t) async {
    await _pump(t, const Question(id: 'q1', text: '흡연하십니까?', type: 'yes_no', required: false));
    expect(find.widgetWithText(OutlinedButton, '예'), findsOneWidget);
    expect(find.widgetWithText(OutlinedButton, '아니오'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
  });

  testWidgets('[QNR-TYPE-09] 예/아니오를 눌러 고른 값이 onChanged로 나간다', (t) async {
    String? got;
    await _pump(t, const Question(id: 'q1', text: '흡연?', type: 'yes_no', required: false),
        onChanged: (v) => got = v);
    await t.tap(find.widgetWithText(OutlinedButton, '예'));
    expect(got, '예');
  });

  testWidgets('[QNR-TYPE-03] 고른 예/아니오 버튼이 눈에 띄게 강조된다', (t) async {
    await _pump(t, const Question(id: 'q1', text: '흡연?', type: 'yes_no', required: false), value: '아니오');
    // 선택된 버튼은 채워진 배경(강조), 나머지는 외곽선만.
    expect(find.byKey(const Key('yesno-selected-아니오')), findsOneWidget);
  });

  testWidgets('[QNR-TYPE-04][QNR-TYPE-05] 「있는지」는 한 문항이 아니라 나눠진 두 문항으로 온다(각각 그린다)', (t) async {
    await _pump(t, const Question(id: 'q1', text: '복용 중인 약이 있으신가요?', type: 'yes_no', required: true));
    expect(find.text('복용 중인 약이 있으신가요?'), findsNothing); // 질문 글자는 마법사가 위에 그림
    await _pump(t, const Question(id: 'q2', text: '어떤 약을 드시고 계신가요?', type: 'short_text', required: false));
    expect(find.byType(TextField), findsOneWidget);
  });

  testWidgets('[QNR-TYPE-06] 나눠 쓰는 이유 — 「있음」만으로는 의사가 쓸 게 없어 뒤 문항이 실제 정보를 받는다', (t) async {
    await _pump(t, const Question(id: 'q2', text: '어떤 알레르기가 있으신가요?', type: 'short_text', required: false));
    expect(find.byType(TextField), findsOneWidget);
  });

  testWidgets('[QNR-TYPE-07] 「아니오」인 사람의 후속 문항은 비운 채 넘어갈 수 있다(막지 않음)', (t) async {
    await _pump(t, const Question(id: 'q2', text: '어떤 약?', type: 'short_text', required: false));
    final tf = t.widget<TextField>(find.byType(TextField));
    expect(tf.controller?.text ?? '', ''); // 비운 상태 허용
  });

  testWidgets('[QNR-TYPE-08] 나누는 판단은 병원 몫 — 앱은 서버가 준 type을 그대로 그린다', (t) async {
    await _pump(t, const Question(id: 'q1', text: '임신 가능성이 있으신가요?', type: 'yes_no', required: true));
    expect(find.widgetWithText(OutlinedButton, '예'), findsOneWidget);
  });

  // ⭐ 실계약 회귀: 백엔드 QUESTION_TYPES=("short_text","long_text","yes_no")가 정본이고
  //    get_template이 이 영문 값을 그대로 내린다. 위젯이 이 값으로 분기해야 한다
  //    (종전엔 한글 '예/아니오'로만 분기해 실제 API 문항이 전부 한 줄 텍스트칸으로 깨졌다 — 세션3·4 갭⑥).
  group('[QNR-TYPE] 서버 정본 영문 type 값으로 렌더한다(실 API 계약)', () {
    testWidgets('short_text = 한 줄', (t) async {
      await _pump(t, const Question(id: 'q1', text: '키', type: 'short_text', required: false));
      expect(t.widget<TextField>(find.byType(TextField)).maxLines, 1);
    });
    testWidgets('long_text = 여러 줄', (t) async {
      await _pump(t, const Question(id: 'q1', text: '증상', type: 'long_text', required: false));
      expect(t.widget<TextField>(find.byType(TextField)).maxLines, greaterThan(1));
    });
    testWidgets('yes_no = 큰 버튼 2개(텍스트칸 아님)', (t) async {
      await _pump(t, const Question(id: 'q1', text: '발열이 있나요?', type: 'yes_no', required: false));
      expect(find.widgetWithText(OutlinedButton, '예'), findsOneWidget);
      expect(find.widgetWithText(OutlinedButton, '아니오'), findsOneWidget);
      expect(find.byType(TextField), findsNothing);
    });
  });
}
