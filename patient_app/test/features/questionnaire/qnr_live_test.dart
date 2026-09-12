import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:hospital_patient_app/features/appointment/appointment_detail.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/questionnaire/qnr_live_banner.dart';
import 'package:hospital_patient_app/features/questionnaire/questionnaire_controller.dart';
import 'package:hospital_patient_app/features/questionnaire/questionnaire_repository.dart';
import 'package:hospital_patient_app/features/questionnaire/questionnaire_wizard.dart';

// 작성 중 예약이 취소됨(Step 10, QNR-LIVE-01~05) + 변경·양식 변화에 흔들리지 않음(Step 11, QNR-LIVE-06~15).

List<Question> _qs(int n) =>
    [for (var i = 1; i <= n; i++) Question(id: 'q$i', text: '문항 $i', type: 'short_text', required: false)];
final _sixQuestions = _qs(6);
final _nineQuestions = _qs(9);

QnrData _data({List<Question>? qs, Map<String, String>? ans, String state = '미작성'}) => QnrData(
    id: 't1',
    state: state,
    answers: ans ?? const {},
    questions: qs ?? _qs(2),
    answered: (ans ?? const {}).length,
    total: (qs ?? _qs(2)).length);

class _FakeRepo implements QuestionnaireRepository {
  _FakeRepo(this._initial) : serverQuestions = _initial.questions;
  final QnrData _initial;
  List<Question> serverQuestions; // 「서버 쪽」 현재 양식 — 진입(load) 뒤 관리자가 바꾸는 것을 흉내낸다.
  int loadCalls = 0;
  @override
  Future<QnrData> load(String id) async {
    loadCalls++;
    return QnrData(
        id: _initial.id,
        questions: serverQuestions, // 다음 진입은 현재 서버 양식으로(QNR-LIVE-13)
        answers: _initial.answers, // 쓴 답은 고유번호로 그대로 붙는다(QNR-LIVE-14)
        state: _initial.state,
        answered: _initial.answers.length,
        total: serverQuestions.length);
  }

  @override
  Future<QnrProgress> save(String id, List<Answer> a, {bool complete = false}) async =>
      // 저장 응답의 total은 「서버가 지금 세는」 값(양식이 늘면 커진다) — 컨트롤러가 무시하는지 보려 일부러 흔든다.
      QnrProgress(state: complete ? '작성완료' : '작성 중', answered: a.length, total: serverQuestions.length);
}

QnrController _ctl({Map<String, String>? answers, List<Question>? qs}) {
  final ans = answers ?? const {'q1': '170'};
  final repo = _FakeRepo(_data(qs: qs ?? _qs(4), ans: ans, state: ans.isEmpty ? '미작성' : '작성 중'));
  final c = ProviderContainer(overrides: [questionnaireRepositoryProvider.overrideWithValue(repo)]);
  addTearDown(c.dispose);
  return c.read(questionnaireProvider('appt-1').notifier);
}

void _serverChangesAppointmentTime() {/* 서버 쪽 일 — 문진 컨트롤러는 아무것도 하지 않는다(QNR-LIVE-07) */}

Widget _wrap(Widget child) => MaterialApp(home: Scaffold(body: child));

AppointmentDetail _detail({
  required String status,
  String? cancelledBy,
  bool isSelf = false,
  String? relation,
  String? name,
}) =>
    AppointmentDetail(
      view: AppointmentView(
        id: 'appt-1',
        status: status,
        forPatientName: '홍길동',
        departmentName: '내과',
        doctorName: '김의사',
        hasQuestionnaire: true,
        isSelf: isSelf,
        cancelledBy: cancelledBy,
        cancelledByRelation: relation,
        cancelledByName: name,
      ),
    );

String? _lastRoute; // 다른 라우트가 그려지면 세팅 — null로 남으면 화면을 옮기지 않은 것이다.
Future<void> _pumpWizard(
  WidgetTester t, {
  bool cancelled = false,
  bool changedTime = false,
  Map<String, String>? answers,
}) async {
  _lastRoute = null;
  final repo = _FakeRepo(_data(qs: _qs(4), ans: answers ?? const {'q1': '170'}, state: '작성 중'));
  final detail = cancelled
      ? _detail(status: '병원취소', cancelledBy: 'hospital')
      : _detail(status: '예약확정');
  final router = GoRouter(initialLocation: '/questionnaire/appt-1', routes: [
    GoRoute(
        path: '/questionnaire/appt-1',
        builder: (c, s) => const QuestionnaireWizard(appointmentId: 'appt-1')),
    GoRoute(
        path: '/questionnaire/appt-1/confirm',
        builder: (c, s) {
          _lastRoute = '/questionnaire/appt-1/confirm';
          return const Scaffold(body: Text('확인 화면'));
        }),
    GoRoute(
        path: '/home',
        builder: (c, s) {
          _lastRoute = '/home';
          return const Scaffold(body: Text('홈'));
        }),
  ]);
  await t.pumpWidget(ProviderScope(
    overrides: [
      questionnaireRepositoryProvider.overrideWithValue(repo),
      appointmentDetailProvider('appt-1').overrideWith((ref) async => detail),
    ],
    child: MaterialApp.router(routerConfig: router),
  ));
  await t.pumpAndSettle();
}

void main() {
  // ─── Step 10: 작성 중 취소 → 그 자리에서 읽기 전용 ───

  testWidgets('[QNR-LIVE-01][QNR-LIVE-05] 취소되면 그 자리에서 읽기 전용 — 입력칸은 잠기고 [다음]·[제출하기]가 사라진다',
      (t) async {
    await _pumpWizard(t, cancelled: true, answers: {'q1': '170'});
    expect(find.text('170'), findsOneWidget); // 쓴 내용은 그대로 보인다
    expect(find.text('다음'), findsNothing); // 진행 버튼이 사라진다
    expect(find.text('최종 확인'), findsNothing);
    expect(find.byType(QuestionnaireWizard), findsOneWidget); // 화면을 옮기지 않았다
    expect(_lastRoute, isNull);
  });

  testWidgets('[QNR-LIVE-02] 안내는 「이 예약이 취소되었습니다 · 병원에서 취소」 + 「지금까지 작성하신 내용은 그대로 남습니다.」',
      (t) async {
    await t.pumpWidget(_wrap(const QnrCancelledBanner(cancelledBy: 'hospital', isSelf: false)));
    expect(find.textContaining('이 예약이 취소되었습니다'), findsOneWidget);
    expect(find.textContaining('병원에서 취소'), findsOneWidget);
    expect(find.text('지금까지 작성하신 내용은 그대로 남습니다.'), findsOneWidget);
  });

  testWidgets('[QNR-LIVE-03] 취소 주체 3갈래 — 병원 / 가족 이름 / 본인', (t) async {
    await t.pumpWidget(_wrap(const QnrCancelledBanner(cancelledBy: 'hospital', isSelf: false)));
    expect(find.textContaining('병원에서 취소'), findsOneWidget);

    await t.pumpWidget(_wrap(const QnrCancelledBanner(
        cancelledBy: 'patient', isSelf: false, relation: '배우자', name: '김영희')));
    expect(find.textContaining('배우자 김영희 님이 취소'), findsOneWidget);

    await t.pumpWidget(_wrap(const QnrCancelledBanner(cancelledBy: 'patient', isSelf: true)));
    expect(find.textContaining('취소하셨습니다'), findsOneWidget);
  });

  testWidgets('[QNR-LIVE-04] [확인]은 병원이 취소했을 때만 — 나머지는 저절로 사라진다', (t) async {
    await t.pumpWidget(_wrap(const QnrCancelledBanner(cancelledBy: 'hospital', isSelf: false)));
    expect(find.text('확인'), findsOneWidget);

    await t.pumpWidget(_wrap(const QnrCancelledBanner(cancelledBy: 'patient', isSelf: true)));
    expect(find.text('확인'), findsNothing); // 본인이 한 일에 [확인]을 요구하지 않는다
  });

  testWidgets('[QNR-LIVE-04] [확인]을 누르면 콜백이 불린다(배너는 스스로 화면을 옮기지 않는다)', (t) async {
    var acked = false;
    await t.pumpWidget(_wrap(QnrCancelledBanner(
        cancelledBy: 'hospital', isSelf: false, onAcknowledge: () => acked = true)));
    await t.tap(find.text('확인'));
    await t.pump();
    expect(acked, isTrue);
    // QnrCancelledBanner에는 Navigator 호출이 없다 — 눌러도 화면을 옮길 수단 자체가 없다.
  });

  test('[QNR-LIVE-01] 컨트롤러는 취소를 상태로만 기록한다 — 화면 이동을 일으키지 않는다', () async {
    final ctl = _ctl();
    await ctl.ready;
    ctl.markCancelled();
    expect(ctl.state.liveCancelled, isTrue);
    expect(ctl.state.answers.isNotEmpty, isTrue); // 쓴 답을 버리지 않는다(QNR-LIVE-05)
  });

  // ─── Step 11: 변경 / 양식 변화 — 흔들지 않는다 ───

  test('[QNR-LIVE-06][QNR-LIVE-07] 예약 시간이 바뀌어도 문진은 아무것도 하지 않는다 — 그대로 이어 쓴다', () async {
    final ctl = _ctl(answers: {'q1': '170'});
    await ctl.ready;
    ctl.goTo(1);
    _serverChangesAppointmentTime(); // 가족이 다른 폰에서 시간을 옮겼다
    expect(ctl.state.index, 1); // 자리를 잃지 않는다
    expect(ctl.state.answers['q1'], '170'); // 쓴 답도 그대로
    expect(ctl.state.liveCancelled, isFalse); // 취소가 아니므로 잠기지 않는다
  });

  testWidgets('[QNR-LIVE-08] 시간이 바뀌어도 문진 화면은 안내를 띄우지 않는다 — 카드·알림이 이미 알렸다', (t) async {
    await _pumpWizard(t, changedTime: true);
    expect(find.textContaining('변경'), findsNothing); // 문진 화면은 조용하다
    expect(find.text('다음'), findsOneWidget); // 계속 쓸 수 있다
  });

  test('[QNR-LIVE-10] 미완성 문진은 버리지 않는다 — 4문항 써둔 사람이 처음부터 다시 쓰지 않는다', () async {
    final ctl = _ctl(answers: {'q1': '170', 'q2': '없음', 'q3': '가끔', 'q4': '아니오'});
    await ctl.ready;
    expect(ctl.state.answers.length, 4);
    expect(ctl.state.status, '작성 중');
  });

  test('[QNR-LIVE-11][QNR-LIVE-12] 관리자가 양식을 바꿔도 이 회차는 진입 때 받은 양식으로 끝까지 간다', () async {
    final repo = _FakeRepo(_data(qs: _sixQuestions));
    final c = ProviderContainer(overrides: [questionnaireRepositoryProvider.overrideWithValue(repo)]);
    addTearDown(c.dispose);
    final ctl = c.read(questionnaireProvider('appt-1').notifier);
    await ctl.ready;
    expect(ctl.state.questions.length, 6);
    repo.serverQuestions = _nineQuestions; // 관리자가 3문항을 더 넣었다
    await ctl.next(); // 자동 저장이 서버를 다녀와도(total=9로 응답)
    expect(ctl.state.questions.length, 6); // ⭐ 눈앞의 양식은 흔들리지 않는다
    expect(ctl.state.total, 6); // 진행률 분모도 (3/6)→(3/9)로 안 뛴다
  });

  test('[QNR-LIVE-13][QNR-LIVE-14] 새 양식은 다음에 이어쓰기로 들어올 때 — 쓴 답이 그대로 붙는다', () async {
    final repo = _FakeRepo(_data(qs: _sixQuestions, ans: {'q1': '170', 'q2': '없음'}));
    repo.serverQuestions = _nineQuestions; // 다음 진입 시점의 양식
    final c = ProviderContainer(overrides: [questionnaireRepositoryProvider.overrideWithValue(repo)]);
    addTearDown(c.dispose);
    final ctl = c.read(questionnaireProvider('appt-1').notifier);
    await ctl.ready; // 새로 들어온다
    expect(ctl.state.questions.length, 9); // 새 양식으로 이어진다
    expect(ctl.state.answers['q1'], '170'); // 고유 번호 덕에 답이 그대로 붙는다(QNR-ID 계열)
    expect(ctl.state.answers['q2'], '없음');
  });

  test('[QNR-LIVE-15] 양식은 진입 시 한 번만 불러온다 — 실시간 구독을 두지 않는다', () async {
    final repo = _FakeRepo(_data(qs: _sixQuestions));
    final c = ProviderContainer(overrides: [questionnaireRepositoryProvider.overrideWithValue(repo)]);
    addTearDown(c.dispose);
    final ctl = c.read(questionnaireProvider('appt-1').notifier);
    await ctl.ready;
    await ctl.next();
    await ctl.next();
    expect(repo.loadCalls, 1); // 저장은 여러 번, 양식 로드는 한 번
  });
}
