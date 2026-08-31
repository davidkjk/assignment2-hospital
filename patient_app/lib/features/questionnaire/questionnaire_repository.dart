import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/providers.dart'; // apiClientProvider (실행 보정: core/providers.dart에 있음)

class Question {
  const Question({required this.id, required this.text, required this.type, required this.required});
  final String id; // 고유 번호 = 열쇠(안 바뀜, QNR-ID-01·03)
  final String text; // 그때 본 글자 = 기록(QNR-ID-02·03)
  final String type; // '단답형' | '장문형' | '예/아니오'
  final bool required;
  factory Question.fromJson(Map<String, dynamic> j) => Question(
      id: j['id'] as String,
      text: j['text'] as String,
      type: j['type'] as String,
      required: (j['required'] as bool?) ?? false);
}

class Answer {
  const Answer({required this.questionId, required this.questionText, required this.value});
  final String questionId, questionText, value;
  Map<String, dynamic> toJson() =>
      {'question_id': questionId, 'question_text': questionText, 'value': value};
}

class QnrData {
  const QnrData(
      {required this.id,
      required this.questions,
      required this.answers,
      required this.state,
      this.answered = 0,
      this.total = 0});
  final String id;
  final List<Question> questions; // 진입 시 고정 = 그 회차 끝까지(QNR-LIVE 계열, 실현은 controller)
  final Map<String, String> answers; // question_id -> value
  final String state; // '미작성' | '작성 중' | '작성완료'
  final int answered, total; // ⭐ 서버 compute_progress 값(QNR-PROG-04·09). 화면이 세지 않는다.

  // 실행 보정: template은 null 가능(백엔드 get_template이 「양식 없음」이면 null) = 0문항과 같이 취급.
  factory QnrData.fromServer(
      {required Map<String, dynamic>? template, Map<String, dynamic>? response}) {
    final qs = ((template?['questions'] as List?) ?? const [])
        .map((e) => Question.fromJson(e as Map<String, dynamic>))
        .toList();
    final ans = <String, String>{};
    for (final a in (response?['answers'] as List? ?? [])) {
      ans[a['question_id'] as String] = (a['value'] as String?) ?? '';
    }
    return QnrData(
        id: (template?['id'] as String?) ?? '',
        questions: qs,
        answers: ans,
        state: (response?['state'] as String?) ?? '미작성', // 행 없음=미작성(QNR-STATE-07 짝)
        // 응답 없음(미작성)이면 answered=0, 분모는 양식의 (성별 필터된) 문항 수 = compute_progress total과 같다.
        answered: (response?['answered'] as int?) ?? 0,
        total: (response?['total'] as int?) ?? qs.length);
  }
}

class QnrProgress {
  const QnrProgress({required this.state, required this.answered, required this.total});
  final String state;
  final int answered, total;
  factory QnrProgress.fromJson(Map<String, dynamic> j) => QnrProgress(
      state: j['state'] as String, answered: j['answered'] as int, total: j['total'] as int);
}

class QuestionnaireRepository {
  QuestionnaireRepository(this._api);
  final ApiClient _api;

  Future<QnrData> load(String appointmentId) async {
    // 실행 보정: 실제 ApiClient는 get<T>(path, parse) 형식이고 template/response 둘 다 null 가능.
    final tpl = await _api.get<Map<String, dynamic>?>(
        '/my/appointments/$appointmentId/questionnaire/template',
        (x) => x as Map<String, dynamic>?);
    final res = await _api.get<Map<String, dynamic>?>(
        '/my/appointments/$appointmentId/questionnaire', (x) => x as Map<String, dynamic>?);
    return QnrData.fromServer(template: tpl, response: res);
  }

  Future<QnrProgress> save(String appointmentId, List<Answer> answers, {bool complete = false}) async {
    // 실행 보정: 백엔드는 PUT을 쓰고, ApiClient에 put<T>(path, body, parse)를 이 태스크에서 추가했다.
    final res = await _api.put<Map<String, dynamic>>(
        '/my/appointments/$appointmentId/questionnaire',
        {'answers': answers.map((a) => a.toJson()).toList(), 'complete': complete},
        (x) => x as Map<String, dynamic>);
    return QnrProgress.fromJson(res);
  }
}

final questionnaireRepositoryProvider =
    Provider((ref) => QuestionnaireRepository(ref.read(apiClientProvider)));
