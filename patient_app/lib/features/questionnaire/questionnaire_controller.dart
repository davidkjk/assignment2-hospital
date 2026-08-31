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
      this.answered = 0,
      this.total = 0,
      this.submitting = false,
      this.loading = true,
      this.liveCancelled = false});
  final List<Question> questions;
  final Map<String, String> answers; // question_id -> value (QNR-ID-01·03 열쇠 = 번호)
  final int index;
  final String status; // 서버 state: 미작성/작성 중/작성완료
  final int answered, total; // ⭐ 서버 compute_progress 값 그대로(QNR-PROG-04·09). 화면이 세지 않는다.
  final bool submitting, loading;
  final bool liveCancelled; // 작성 중 예약이 취소됨(QNR-LIVE-01) — Step 10에서 채운다.

  QnrState copyWith(
          {List<Question>? questions,
          Map<String, String>? answers,
          int? index,
          String? status,
          int? answered,
          int? total,
          bool? submitting,
          bool? loading,
          bool? liveCancelled}) =>
      QnrState(
          questions: questions ?? this.questions,
          answers: answers ?? this.answers,
          index: index ?? this.index,
          status: status ?? this.status,
          answered: answered ?? this.answered,
          total: total ?? this.total,
          submitting: submitting ?? this.submitting,
          loading: loading ?? this.loading,
          liveCancelled: liveCancelled ?? this.liveCancelled);

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
        answered: data.answered, // ⭐ 서버가 센 값(QNR-PROG-04) — 화면이 answers.length로 세지 않는다.
        total: data.total,
        loading: false);
  }

  void answer(String questionId, String value) =>
      state = state.copyWith(answers: {...state.answers, questionId: value});

  List<Answer> _answerList() => [
        for (final q in state.questions)
          if (state.answers.containsKey(q.id))
            Answer(questionId: q.id, questionText: q.text, value: state.answers[q.id]!),
      ];

  /// QNR-LIVE-01: 예약이 취소됐다는 사실만 켠다. 화면 이동·답 삭제는 하지 않는다(QNR-LIVE-05).
  void markCancelled() => state = state.copyWith(liveCancelled: true);

  /// 문항을 넘길 때마다 자동 저장(complete=false) — QNR-STATE-04는 여기서 완료를 안 찍는다.
  Future<void> next() async {
    final prog = await _repo.save(_appointmentId, _answerList(), complete: false); // QNR-ID-10 글자 동봉
    state = state.copyWith(
        status: prog.state,
        answered: prog.answered, // 저장 응답의 서버 진행률을 그대로 싣는다(QNR-PROG-04·09)
        // ⭐ QNR-LIVE-12: 분모는 이 회차 진입 양식으로 고정한다 — 관리자가 문항을 늘려도(서버 total이 커져도)
        //    진행률이 (3/6)→(3/9)로 도중에 흔들리지 않는다. 새 양식은 다음 이어쓰기 진입에서 반영된다(QNR-LIVE-13).
        total: state.questions.length,
        index: (state.index + 1).clamp(0, state.questions.length));
  }

  void prev() => state = state.copyWith(index: (state.index - 1).clamp(0, state.questions.length));
  void goTo(int i) => state = state.copyWith(index: i.clamp(0, state.questions.length));

  Future<QnrProgress> submit() async {
    state = state.copyWith(submitting: true);
    final prog = await _repo.save(_appointmentId, _answerList(), complete: true); // 이때만 완료 표시
    state = state.copyWith(
        submitting: false, status: prog.state, answered: prog.answered, total: prog.total);
    return prog;
  }
}

final questionnaireProvider = StateNotifierProvider.family<QnrController, QnrState, String>(
    (ref, appointmentId) => QnrController(ref.read(questionnaireRepositoryProvider), appointmentId));
