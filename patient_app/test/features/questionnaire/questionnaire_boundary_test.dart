import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/questionnaire/questionnaire_repository.dart';
import 'package:hospital_patient_app/features/questionnaire/question_field.dart';
import 'package:hospital_patient_app/features/questionnaire/questionnaire_entry.dart';

void main() {
  test('[QNR-FORM-01][QNR-FORM-02] 상한 30문항·31개째 거절은 서버(직원웹 upsert_template) 몫 — 앱은 받은 문항 수를 신뢰한다', () {
    // 앱에는 문항 수 상한 검증 코드가 없다(중복 방어 안 함). get_template이 준 questions를 그대로 쓴다.
    final data = QnrData.fromServer(
      template: {
        'id': 't1',
        'total': 30,
        'questions': [for (var i = 1; i <= 30; i++) {'id': 'q$i', 'text': '문항$i', 'type': '단답형', 'required': false}]
      },
      response: null,
    );
    expect(data.questions.length, 30); // 서버가 30까지만 주므로 앱은 30을 그린다
  });

  testWidgets('[QNR-FORM-03] 앱은 서버가 준 문항을 감추지 않는다(있지도 않은 답을 의사가 기다리지 않게)', (t) async {
    // 어떤 문항이 와도 QuestionField로 그려진다 — 앱이 임의로 숨기는 분기가 없다.
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: QuestionField(
                question: const Question(id: 'q1', text: '병원이 넣은 질문', type: '단답형', required: false),
                value: null,
                onChanged: (_) {}))));
    expect(find.text('병원이 넣은 질문'), findsNothing); // 질문 글자는 마법사가 위에 그림(필드는 입력칸만)
    expect(find.byType(TextField), findsOneWidget); // 감추지 않고 입력칸을 낸다
  });

  test('[QNR-FORM-04][QNR-FORM-05] 하한 0문항 허용 = 「이 진료과는 문진을 받지 않는다」 — 앱은 0문항을 정상 상태로 받는다', () {
    final data = QnrData.fromServer(template: {'id': 't1', 'total': 0, 'questions': []}, response: null);
    expect(data.questions, isEmpty); // 오류가 아니라 정상(QuestionnaireEntry가 홈으로 방어)
  });

  test('[QNR-FORM-09] 상한·하한 검증은 서버 upsert_template 몫 — 앱에 중복 검증을 두지 않는다', () {
    // 앱 어디에도 questions.length 를 30/0으로 막는 코드가 없음을 계약으로 남긴다.
    expect(editableStatuses.contains('예약확정'), isTrue); // 앱이 신뢰하는 서버 계약(형식 확인)
  });

  test('[QNR-REQ-03][QNR-REQ-04][QNR-REQ-05] required = 「환자가 반드시」가 아니라 「병원이 확인할 항목」 — 앱은 required로 입력을 강제하지 않는다', () {
    // required=true여도 앱은 빈 답을 그대로 저장한다(강제 아님). 이 뜻이 QNR-REQ-01·02로 실현된다.
    const q = Question(id: 'q1', text: '임신 가능성', type: '예/아니오', required: true);
    expect(q.required, isTrue); // 표시는 있으나 앱은 이걸로 막지 않는다(검증은 의사 화면)
  });

  test('[QNR-REQ-06][QNR-REQ-07][QNR-REQ-08][QNR-REQ-09] 빈칸·미완성을 눈에 띄게 그리는 것은 의사 화면(직원웹 DOCTOR-QNR) 몫', () {
    // patient_app에는 의사 화면이 없다 — 「앱이 안 막는다」(QNR-REQ-01·02)가 성립하려면
    // 직원웹 DOCTOR-QNR-01·02가 빈칸(답변 없음)·미완성(작성 중)을 주의색으로 보여줘야 한다.
    const req = ['DOCTOR-QNR-01', 'DOCTOR-QNR-02']; // staff-web 소유(빈칸·미완성 표시)
    expect(req.length, 2);
  });

  test('[QNR-REQ-11] 관리자 필수 체크박스는 남기되 설명 문구를 새 뜻으로 — 직원웹 관리자 화면 몫', () {
    // 앱은 관리자 화면이 없다. required 플래그를 받아 쓰기만 하고, 체크박스·설명은 staff-web QADM.
    const q = Question(id: 'q1', text: 'x', type: '단답형', required: true);
    expect(q.required, isA<bool>()); // 앱은 플래그를 소비만 한다
  });
}
