import 'package:flutter/material.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/appointments/appointment_list_status.dart';
import 'package:hospital_patient_app/widgets/status_label.dart'; // T0
import 'package:hospital_patient_app/core/tokens.dart'; // T0 AppTokens

/// 시각 레일 폭 — 문진 경고 줄(T31 LIST-QNR-07)이 같은 상자임을 보이려 이만큼 들여쓴다.
const double kListRailWidth = 64;

/// LIST-LIST-06~15 + LIST-ST-14·15·17: 얇은 줄. 버튼은 하나도 두지 않는다(확인은 상세 한 곳에서만).
class AppointmentListRow extends StatelessWidget {
  final AppointmentView view;
  final DateTime now;
  const AppointmentListRow({super.key, required this.view, required this.now});

  Color _railColor() => // LIST-LIST-08: 예약신청은 회색(아직 확정 시각 아님), 그 외 딥틸
      view.status == '예약신청' ? AppTokens.grayPending : AppTokens.primary;

  String _time() {
    final s = view.slotStart;
    return s == null ? '' : '${s.hour.toString().padLeft(2, '0')}:${s.minute.toString().padLeft(2, '0')}';
  }

  Color _toneColor(ListStatusTone t) =>
      t == ListStatusTone.attention ? AppTokens.warn : AppTokens.grayPending;

  @override
  Widget build(BuildContext context) {
    final st = listStatusLabel(view, now); // LIST-ST 표
    final who = view.isSelf ? '본인' : view.forPatientName; // LIST-LIST-15: 본인도 '본인'으로 표기
    return Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
      Container(
        // 시각 레일(LIST-LIST-07)
        key: const Key('list-rail'),
        width: kListRailWidth,
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(color: _railColor(), borderRadius: BorderRadius.circular(8)),
        child: Column(children: [
          Text(_time(),
              style: const TextStyle(
                  color: Colors.white, fontSize: 18, fontFeatures: [FontFeature.tabularFigures()])),
          const SizedBox(height: 2),
          Text(who, style: const TextStyle(color: Colors.white, fontSize: 12)), // 아래에 관계(LIST-LIST-07)
        ]),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(who, // 누구 예약인지 먼저·굵게(LIST-LIST-09·10)
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          const SizedBox(height: 2),
          Text('${view.departmentName} · ${view.doctorName}', // 그 아래 진료과·의사
              style: const TextStyle(color: AppTokens.grayPending, fontSize: 13)),
        ]),
      ),
      // 오른쪽: 상태 글자 또는 › 하나(LIST-LIST-11). 버튼은 없다(LIST-LIST-12·ST-15·17·18).
      st.label == null
          ? const Icon(Icons.chevron_right, key: Key('list-chevron'))
          : StatusLabel(text: st.label!, color: _toneColor(st.tone)),
    ]);
  }
}

/// LIST-LIST-06: 줄과 (T31이 채울) 문진 경고 줄을 하나의 테두리로 묶는다.
class AppointmentBox extends StatelessWidget {
  final AppointmentView view;
  final DateTime now;
  final Widget? questionnaireSlot; // T31의 LIST-QNR 줄. null이면 줄만.
  final VoidCallback? onTap; // 줄 본문 탭 → 예약 상세(NAV-LIST-02, 화면이 주입)
  const AppointmentBox(
      {super.key, required this.view, required this.now, this.questionnaireSlot, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('appointment-box'),
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      decoration: BoxDecoration(
          border: Border.all(color: const Color(0xFFE1E7EA)), borderRadius: BorderRadius.circular(12)),
      child: Column(children: [
        InkWell(
          // 줄 본문만 탭 대상(NAV-LIST-02)
          onTap: onTap,
          child: Padding(
              padding: const EdgeInsets.all(12), child: AppointmentListRow(view: view, now: now)),
        ),
        if (questionnaireSlot != null) questionnaireSlot!, // 같은 상자 안, 별도 탭(NAV-LIST-04)은 T31이 붙인다
      ]),
    );
  }
}
