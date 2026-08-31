import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'questionnaire_repository.dart';

enum QnrStatusColor { pending, done }

/// QNR-STATE-05·06: 미작성·작성 중=주의색(할 일 남음), 작성완료=회색(끝난 일).
QnrStatusColor qnrStatusColor(String state) =>
    state == '작성완료' ? QnrStatusColor.done : QnrStatusColor.pending;

class QnrState {
  const QnrState(
      {required this.questions,
      required this.answers,
      required this.index,
      required this.status,
      this.submitting = false,
      this.loading = true});
  final List<Question> questions;
  final Map<String, String> answers; // question_id -> value (QNR-ID-01·03 열쇠 = 번호)
  final int index;
  final String status; // 서버 state: 미작성/작성 중/작성완료
  final bool submitting, loading;

  QnrState copyWith(
          {List<Question>? questions,
          Map<String, String>? answers,
          int? index,
          String? status,
          bool? submitting,
          bool? loading}) =>
      QnrState(
          questions: questions ?? this.questions,
          answers: answers ?? this.answers,
          index: index ?? this.index,
          status: status ?? this.status,
          submitting: submitting ?? this.submitting,
          loading: loading ?? this.loading);

  Question? get current => index >= 0 && index < questions.length ? questions[index] : null;
}

class QnrController extends StateNotifier<QnrState> {
  QnrController(this._repo, this._appointmentId)
      : super(const QnrState(questions: [], answers: {}, index: 0, status: '미작성')) {
    ready = _load();
  }
  final QuestionnaireRepository _repo;
  final String _appointmentId;
  late final Future<void> ready;

  Future<void> _load() async {
    // QNR-ID-04·QNR-LIVE 계열: 진입 시 받은 문항을 그 회차 내내 고정한다(뒤에서 안 흔들림).
    final data = await _repo.load(_appointmentId);
    state = QnrState(
        questions: data.questions,
        answers: Map.of(data.answers),
        index: 0,
        status: data.state,
        loading: false);
  }

  void answer(String questionId, String value) =>
      state = state.copyWith(answers: {...state.answers, questionId: value});

  List<Answer> _answerList() => [
        for (final q in state.questions)
          if (state.answers.containsKey(q.id))
            Answer(questionId: q.id, questionText: q.text, value: state.answers[q.id]!),
      ];

  /// 문항을 넘길 때마다 자동 저장(complete=false) — QNR-STATE-04는 여기서 완료를 안 찍는다.
  Future<void> next() async {
    final prog = await _repo.save(_appointmentId, _answerList(), complete: false); // QNR-ID-10 글자 동봉
    state = state.copyWith(
        status: prog.state, index: (state.index + 1).clamp(0, state.questions.length));
  }

  void prev() => state = state.copyWith(index: (state.index - 1).clamp(0, state.questions.length));
  void goTo(int i) => state = state.copyWith(index: i.clamp(0, state.questions.length));

  Future<QnrProgress> submit() async {
    state = state.copyWith(submitting: true);
    final prog = await _repo.save(_appointmentId, _answerList(), complete: true); // 이때만 완료 표시
    state = state.copyWith(submitting: false, status: prog.state);
    return prog;
  }
}

final questionnaireProvider = StateNotifierProvider.family<QnrController, QnrState, String>(
    (ref, appointmentId) => QnrController(ref.read(questionnaireRepositoryProvider), appointmentId));
