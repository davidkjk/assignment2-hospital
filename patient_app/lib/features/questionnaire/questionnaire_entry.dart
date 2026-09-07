import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../appointment/appointment_detail.dart'; // appointmentDetailProvider·AppointmentDetail (T8/T20/T21)
import 'questionnaire_controller.dart';
import 'qnr_load_gate.dart';
import 'questionnaire_wizard.dart';
import 'resume_screen.dart';
import 'confirm_screen.dart';

/// 진료가 시작되기 전까지만 수정 가능(#21). 이 밖은 읽기전용.
const editableStatuses = {'예약신청', '예약확정', '도착', '진료대기'};

/// 출발지 → 제출·뒤로 갈 곳(NAV-QNR-05·07·08·09·15).
String returnRouteFor(String? from, String appointmentId) {
  switch (from) {
    case 'detail':
      return '/appointments/$appointmentId'; // NAV-QNR-07
    case 'noti':
      return '/notifications'; // NAV-QNR-08
    case 'history':
      return '/history'; // NAV-QNR-10
    case 'booking': // NAV-QNR-05 예약 완료 → 홈
    case 'push': // NAV-QNR-09 푸시 → 홈
    default:
      return '/home'; // NAV-QNR-01 홈 카드
  }
}

/// `/questionnaire/:id` 진입 시 서버 상태에 따라 다른 화면을 연다(NAV-QNR-01~10·18·19).
class QuestionnaireEntry extends ConsumerStatefulWidget {
  const QuestionnaireEntry({super.key, required this.appointmentId});
  final String appointmentId;

  @override
  ConsumerState<QuestionnaireEntry> createState() => _QuestionnaireEntryState();
}

class _QuestionnaireEntryState extends ConsumerState<QuestionnaireEntry> {
  // ⭐ 위저드 vs 이어쓰기(Resume) vs 확인 분기는 「진입 시점 문진 상태」로 1회만 정한다.
  //    위저드에서 1문항을 자동저장하면 상태가 미작성→작성 중으로 바뀌는데(controller.next), 매 변화마다
  //    재분기하면 위저드가 이어쓰기 화면으로 교체돼 버린다(사용자 검수 2026-09-07 회귀). 여기서 고정한다.
  //    이어쓰기·처음부터·고치기 진입은 라우터가 `?start=N`으로 위저드에 직행하므로 Entry를 거치지 않는다.
  String? _entryStatus;

  @override
  Widget build(BuildContext context) {
    final id = widget.appointmentId;
    final st = ref.watch(questionnaireProvider(id));
    final detail = ref.watch(appointmentDetailProvider(id));
    final from = GoRouterState.of(context).uri.queryParameters['from'];
    final returnTo = returnRouteFor(from, id);

    // 로드 실패면 [다시 시도], 로딩 중이면 스피너(막다른 스피너 방지 — qnr_load_gate).
    final gate = qnrLoadGate(ref, st, id);
    if (gate != null || detail.isLoading) {
      return gate ?? const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    // 0문항 처리(QNR-FORM-06·07·NAV-QNR-19): 문항도 답도 없으면 들어올 길이 없다 → 홈으로 방어.
    if (st.questions.isEmpty && st.answers.isEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted) context.go('/home');
      });
      return const Scaffold(body: SizedBox.shrink());
    }
    // QNR-FORM-06b: 0문항이어도 쓴 답이 있으면 읽기전용 조회는 남는다.
    if (st.questions.isEmpty) {
      return ConfirmScreen(appointmentId: id, readOnly: true, returnTo: returnTo);
    }

    // 실행 보정: appointmentDetailProvider는 AppointmentDetail?를 주고 상태는 .view.status에 있다.
    final status = detail.valueOrNull?.view.status;
    final readOnly = status != null && !editableStatuses.contains(status); // NAV-QNR-04·10
    if (readOnly) {
      return ConfirmScreen(appointmentId: id, readOnly: true, returnTo: returnTo);
    }
    // NAV-QNR-18: 취소 등으로 상태가 바뀌어도 여기 머문다(읽기전용 전환은 T24 QNR-LIVE 계열).

    // 진입 시점의 문진 상태로 분기를 1회 고정(그 뒤 자동저장이 위저드를 이어쓰기로 바꾸지 않게).
    _entryStatus ??= st.status;
    switch (_entryStatus) {
      case '작성완료':
        return ConfirmScreen(appointmentId: id, readOnly: false, returnTo: returnTo); // NAV-QNR-03
      case '작성 중':
        return ResumeScreen(appointmentId: id); // NAV-QNR-02
      case '미작성':
      default:
        return QuestionnaireWizard(appointmentId: id, startIndex: 0); // NAV-QNR-01·05
    }
  }
}
