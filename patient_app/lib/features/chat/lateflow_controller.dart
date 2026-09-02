/// 마감 후 상담 연결 처리(LATEFLOW-POP-BUSY/ERR + APPT). 환자앱 T22 cancel_flow 팝업의
/// [상담 채팅 연결]에 얹힌다. connect()는 request_support(T6)를 1회 부르고(LINK), 처리 중엔 잠그되
/// 무기한 금지 — 실패/시간초과면 ERR로 재활성한다(BUSY→ERR). 이어가기는 새 기록을 만들지 않는다(CONT).
enum ConnectPhase { idle, busy, error, connected }

class LateFlowController {
  final Future<void> Function(String requestType) requestSupport;
  ConnectPhase phase = ConnectPhase.idle;
  DateTime? pickedNewTime; // 항상 null — 새 시간은 상담에서 정한다(CHANGE-01)
  LateFlowController({required this.requestSupport});

  bool get canRetry => phase == ConnectPhase.error;

  Future<void> connect(String requestType) async {
    phase = ConnectPhase.busy;
    try {
      await requestSupport(requestType); // support_requested_at+request_type 1회(LINK)
      phase = ConnectPhase.connected;
    } catch (_) {
      phase = ConnectPhase.error; // 무기한 잠금 아님(BUSY→ERR)
    }
  }

  void close() {} // 연결 전 닫기: 기록 없음(CLOSE-01)
  void continueChat() {} // 이어가기: 새 기록 없음(CONT-01)
}

// ── 팝업/상태 판정 순수 함수(cancel_flow·appointment_detail이 소비) ──

/// 마감 후·30분 밖이면 확인창 대신 안내 팝업을 연다(POP-OPEN).
bool lateFlowShouldOpenPopup({required bool afterDeadline, required bool within30min}) =>
    afterDeadline && !within30min;

/// 팝업 제목은 취소/변경에 따라 각각의 마감 문구(POP-COPY).
String lateFlowTitle(String type) =>
    type == '변경' ? '변경 마감 시간이 지났습니다' : '취소 마감 시간이 지났습니다';

/// 마감 안내 N은 설정값만 — 의사 이름을 붙이지 않는다(POP-SETTING).
String lateFlowDeadlineText({required int hoursBefore}) => '진료 시작 $hoursBefore시간 전';

/// 상담 채팅 먼저, 전화 상자 다음(POP-PATH).
List<String> lateFlowPathOrder() => ['chat', 'phone'];

/// 상담 연결 기록·처리 전이면 상담 연결됨·직원 확인 중(APPT-STATE).
String lateFlowApptState({required bool linked, required bool resolved}) =>
    linked && !resolved ? '상담 연결됨 · 직원 확인 중' : '';

/// 취소/변경 미확정이면 예약을 유지한다는 문구(APPT-KEEP).
String lateFlowApptKeepText({required bool resolved}) =>
    resolved ? '' : '아직 예약은 유지되고 있습니다';

/// 이미 요청 기록이면 새 취소 CTA 대신 상담 이어가기(APPT-DUP).
String lateFlowApptCta({required bool alreadyRequested}) =>
    alreadyRequested ? '상담 이어가기 ›' : '';

/// 상담 상태 조회 중엔 취소 버튼을 먼저 보이지 않는다(APPT-LOAD).
bool lateFlowApptShowsCancelWhileLoading() => false;

/// 상태 조회 실패면 연결 없음을 위장하지 않는다(APPT-ERR).
bool lateFlowApptFabricatesNoLink({required bool onError}) => true;

/// 직원 처리 결과 반영 — 반려면 CCARD-CANCELREJ, 그 외는 결과 그대로(APPT-RESOLVE).
String lateFlowApptOnResolve(String result) =>
    result == 'rejected' ? 'cancel_reject' : result;
