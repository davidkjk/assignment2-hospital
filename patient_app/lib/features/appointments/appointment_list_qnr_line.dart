import 'package:flutter/material.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/appointments/appointment_list_row.dart'; // kListRailWidth
import 'package:hospital_patient_app/features/questionnaire/qnr_progress_text.dart'; // qnrRowText(T24)
import 'package:hospital_patient_app/widgets/warn_text.dart'; // DISP-WARN-01

/// 진료 시작 전 = 예약신청·예약확정. 도착·진료대기·진료중은 진료 임박/이후라 목록 경고 대상이 아니다.
bool _isBeforeTreatment(String status) => status == '예약신청' || status == '예약확정';

/// LIST-QNR: 상자 안 문진 경고 줄. 「지금 할 일이 있는 줄」(진료 시작 전 + 미작성/작성 중)에만 그린다.
/// 완료·진료중 이후·문진 미보유면 null(목록엔 안 뜨고, 완료분은 상세에서 본다 — LIST-QNR-02·04·05).
Widget? appointmentListQnrLine(AppointmentView view, {required VoidCallback onOpen}) {
  // 문진 미보유 진료과 = 답할 문항이 0. ⚠️ hasQuestionnaire(응답 행 존재)로 가르면 「미작성」은
  // 아직 응답 행이 없어 false라, LIST-QNR-01 경고줄이 영영 안 떴다(세션3·4 갭③ 원인). 문항 수로 가른다.
  if (view.questionnaireTotal == 0) return null;
  if (!_isBeforeTreatment(view.status)) return null; // LIST-QNR-04: 도착·진료중 이후는 안 준다
  final String text;
  switch (view.questionnaireState) {
    case '미작성':
      text = '사전문진 미작성 · 작성하기 ›'; // LIST-QNR-01
      break;
    case '작성 중':
      // LIST-QNR-03: 「사전문진 작성 중 (3/8) · 이어서 쓰기」 — 진행률은 T24 qnrRowText 한 곳에서.
      text = '${qnrRowText(answered: view.questionnaireAnswered, total: view.questionnaireTotal)} · 이어서 쓰기 ›';
      break;
    default: // 작성완료 등
      return null; // LIST-QNR-02·05: 목록엔 안 뜬다
  }
  return Padding(
    // LIST-QNR-07: 왼쪽을 레일 폭만큼 띄워 같은 상자(줄과 한 몸)임을 보인다.
    padding: const EdgeInsets.fromLTRB(kListRailWidth, 0, 12, 10),
    child: InkWell(
      onTap: onOpen, // LIST-QNR-06: 누르면 문진 화면으로(상세를 거치지 않는다 — NAV-LIST-04)
      child: WarnText(text), // LIST-QNR-08=DISP-WARN-01: 배경 없이 글자 + 좌측 4px 바
    ),
  );
}
