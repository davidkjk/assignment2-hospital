import 'package:flutter/material.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/questionnaire/qnr_progress_text.dart'; // qnrRowText(T24)
import 'package:hospital_patient_app/core/tokens.dart'; // AppTokens

/// 진료 시작 전 = 예약신청·예약확정. 도착·진료대기·진료중은 진료 임박/이후라 목록 경고 대상이 아니다.
bool _isBeforeTreatment(String status) => status == '예약신청' || status == '예약확정';

/// LIST-QNR: 상자 안 문진 줄. 「지금 할 일이 있는 줄」(진료 시작 전 + 미작성/작성 중)에만 그린다.
/// 완료·진료중 이후·문진 미보유면 null(목록엔 안 뜨고, 완료분은 상세에서 본다 — LIST-QNR-02·04·05).
/// 데모(Task10)대로 카드 아래 딥틸 틴트 밴드 — 상단 경계 + 옅은 딥틸 바탕 + 딥틸 글자 + ›.
Widget? appointmentListQnrLine(AppointmentView view, {required VoidCallback onOpen}) {
  // 문진 미보유 진료과 = 답할 문항이 0. ⚠️ hasQuestionnaire(응답 행 존재)로 가르면 「미작성」은
  // 아직 응답 행이 없어 false라, LIST-QNR-01 밴드가 영영 안 떴다(세션3·4 갭③ 원인). 문항 수로 가른다.
  if (view.questionnaireTotal == 0) return null;
  if (!_isBeforeTreatment(view.status)) return null; // LIST-QNR-04: 도착·진료중 이후는 안 준다
  final String text;
  switch (view.questionnaireState) {
    case '미작성':
      text = '사전문진 미작성 · 작성하기'; // LIST-QNR-01
      break;
    case '작성 중':
      // LIST-QNR-03: 「사전문진 작성 중 (3/8) · 이어서 쓰기」 — 진행률은 T24 qnrRowText 한 곳에서.
      text = '${qnrRowText(answered: view.questionnaireAnswered, total: view.questionnaireTotal)} · 이어서 쓰기';
      break;
    default: // 작성완료 등
      return null; // LIST-QNR-02·05: 목록엔 안 뜬다
  }
  return InkWell(
    onTap: onOpen, // LIST-QNR-06: 누르면 문진 화면으로(상세를 거치지 않는다 — NAV-LIST-04)
    child: Container(
      key: const Key('qnr-band'),
      width: double.infinity,
      // LIST-QNR-07: 줄과 한 상자임을 상단 경계+같은 카드 안에 담아 보인다(데모 border-t 방식).
      decoration: const BoxDecoration(
        color: Color(0x1A0B6E70), // primary 10% (bg-primary/10)
        border: Border(top: BorderSide(color: Color(0x330B6E70))), // primary 20% (border-primary/20)
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(children: [
        Expanded(
          child: Text(text,
              style: const TextStyle(
                  color: AppTokens.primary, fontSize: 13, fontWeight: FontWeight.w500)),
        ),
        const Icon(Icons.chevron_right, size: 18, color: AppTokens.primary),
      ]),
    ),
  );
}
