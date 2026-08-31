import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hospital_patient_app/features/questionnaire/questionnaire_repository.dart';
import 'package:hospital_patient_app/features/questionnaire/questionnaire_controller.dart';

class _FakeRepo implements QuestionnaireRepository {
  _FakeRepo(this._data);
  final QnrData _data;
  final saved = <List<Answer>>[];
  bool lastComplete = false;
  @override
  Future<QnrData> load(String id) async => _data;
  @override
  Future<QnrProgress> save(String id, List<Answer> a, {bool complete = false}) async {
    saved.add(a);
    lastComplete = complete;
    return QnrProgress(state: complete ? '작성완료' : '작성 중', answered: a.length, total: _data.questions.length);
  }
}

QnrData _data({List<Question>? qs, Map<String, String>? ans, String state = '미작성'}) => QnrData(
      id: 't1',
      state: state,
      answers: ans ?? {},
      questions: qs ??
          const [
            Question(id: 'q1', text: '키', type: '단답형', required: false),
            Question(id: 'q2', text: '복용 중인 약이 있으신가요?', type: '예/아니오', required: true),
          ]);

QnrController _ctl(_FakeRepo repo) {
  final c = ProviderContainer(overrides: [questionnaireRepositoryProvider.overrideWithValue(repo)]);
  addTearDown(c.dispose);
  final ctl = c.read(questionnaireProvider('appt-1').notifier);
  return ctl;
}

void main() {
  test('[QNR-ID-01][QNR-ID-03] 답은 질문 글자가 아니라 고유 번호(question_id)를 열쇠로 든다', () async {
    final repo = _FakeRepo(_data());
    final ctl = _ctl(repo);
    await ctl.ready;
    ctl.answer('q1', '170');
    expect(ctl.state.answers['q1'], '170'); // 열쇠는 'q1'이지 '키'가 아니다
  });

  test('[QNR-ID-04] 진입 시 받은 문항을 고정한다 — 뒤에서 글자가 바뀌어도 눈앞 문항·답 그대로', () async {
    final repo = _FakeRepo(_data(ans: {'q2': '예'}, state: '작성 중'));
    final ctl = _ctl(repo);
    await ctl.ready;
    expect(ctl.state.questions[1].text, '복용 중인 약이 있으신가요?');
    expect(ctl.state.answers['q2'], '예'); // 답이 그대로 붙어 있다
  });

  test('[QNR-ID-05] 다음 이어쓰기 진입은 새로 load하여 바뀐 글자를 받는다', () async {
    final repo = _FakeRepo(_data(qs: [const Question(id: 'q1', text: '키(cm)', type: '단답형', required: false)]));
    final ctl = _ctl(repo);
    await ctl.ready;
    expect(ctl.state.questions.first.text, '키(cm)'); // 새 진입 = 새 양식
  });

  test('[QNR-ID-07] 문항을 지우고 새로 만들면 번호가 달라 답이 안 붙는다(의도된 동작)', () async {
    final repo = _FakeRepo(_data(
        qs: [const Question(id: 'q9', text: '키', type: '단답형', required: false)], ans: {'q1': '170'}));
    final ctl = _ctl(repo);
    await ctl.ready;
    expect(ctl.state.answers.containsKey('q9'), isFalse); // 다른 질문이므로 안 붙는다
  });

  test('[QNR-STATE-07] 문진 행이 없으면 미작성 — completed_at으로 판정(행 존재 아님)', () async {
    final repo = _FakeRepo(_data(state: '미작성'));
    final ctl = _ctl(repo);
    await ctl.ready;
    expect(ctl.state.status, '미작성');
  });

  test('[QNR-STATE-05][QNR-STATE-06] 상태 색: 미작성·작성 중=주의색, 작성완료=회색', () {
    expect(qnrStatusColor('미작성'), QnrStatusColor.pending); // 주의색(할 일 남음)
    expect(qnrStatusColor('작성 중'), QnrStatusColor.pending);
    expect(qnrStatusColor('작성완료'), QnrStatusColor.done); // 회색(끝난 일)
  });

  test('[QNR-ID-08][QNR-ID-09] 양식이 바뀌어도 막지 않고 처음부터 다시 쓰게 하지 않는다(답 유지)', () async {
    final repo = _FakeRepo(_data(
        qs: [
          const Question(id: 'q1', text: '키', type: '단답형', required: false),
          const Question(id: 'q3', text: '몸무게', type: '단답형', required: false)
        ],
        ans: {'q1': '170'},
        state: '작성 중'));
    final ctl = _ctl(repo);
    await ctl.ready;
    expect(ctl.state.answers['q1'], '170'); // 다시 안 쓴다
    expect(ctl.state.questions.length, 2); // 막지 않고 새 문항까지 이어간다
  });

  test('[QNR-ID-10] 답은 controller가 question_text(그때 글자)를 함께 실어 save한다', () async {
    final repo = _FakeRepo(_data());
    final ctl = _ctl(repo);
    await ctl.ready;
    ctl.answer('q1', '170');
    await ctl.next();
    expect(repo.saved.last.first.questionText, '키'); // 글자로 매칭 아님을 서버가 스냅샷으로 보존
  });
}
