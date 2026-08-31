import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/questionnaire/questionnaire_repository.dart';

void main() {
  test('Answer.toJson은 {question_id, question_text, value} 형식(T7 스냅샷 계약)', () {
    const a = Answer(questionId: 'q3', questionText: '복용 중인 약이 있으신가요?', value: '예');
    expect(a.toJson(), {'question_id': 'q3', 'question_text': '복용 중인 약이 있으신가요?', 'value': '예'});
  });

  test('QnrData.fromServer는 template.questions와 response.answers를 합쳐 question_id로 value를 매긴다', () {
    final data = QnrData.fromServer(
      template: {'id': 't1', 'questions': [
        {'id': 'q1', 'text': '키', 'type': '단답형', 'required': false},
        {'id': 'q2', 'text': '증상', 'type': '장문형', 'required': true},
      ], 'total': 2},
      response: {'answers': [{'question_id': 'q1', 'question_text': '키', 'value': '170'}], 'state': '작성 중'},
    );
    expect(data.questions.map((q) => q.id), ['q1', 'q2']);
    expect(data.answers['q1'], '170');   // 답이 있는 문항
    expect(data.answers.containsKey('q2'), isFalse);  // 안 쓴 문항은 키 없음
    expect(data.state, '작성 중');
  });

  test('QnrData.fromServer는 response가 null이면 답 없음·미작성', () {
    final data = QnrData.fromServer(
      template: {'id': 't1', 'questions': [{'id': 'q1', 'text': '키', 'type': '단답형', 'required': false}], 'total': 1},
      response: null);
    expect(data.answers, isEmpty);
    expect(data.state, '미작성');
  });

  // 실행 보정: 백엔드 get_template은 「양식 없음」이면 null을 준다(0문항과 같은 상황, QNR-FORM-06·07).
  // 플랜은 template을 non-null로 가정했으나 실제 계약상 null 방어가 필요하다.
  test('QnrData.fromServer는 template이 null이면 문항 0개·미작성(양식 없는 진료과)', () {
    final data = QnrData.fromServer(template: null, response: null);
    expect(data.questions, isEmpty);
    expect(data.answers, isEmpty);
    expect(data.state, '미작성');
  });
}
