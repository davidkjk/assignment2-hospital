import 'package:flutter/material.dart';
import 'package:hospital_patient_app/features/home/appointment_view.dart';
import 'package:hospital_patient_app/features/appointments/appointment_list_status.dart';
import 'package:hospital_patient_app/core/tokens.dart'; // T0 AppTokens

/// LIST-ROLE-02 + 데모 `AppointmentRow`(2026-09-01 Task10): 얇은 컴팩트 행.
/// 큰 컬러 레일 블록을 버리고 데모대로 — [시각] [이름+관계 / 과·의사 선생님] [상태 회색글자] [›].
/// 버튼은 하나도 두지 않는다(확인은 상세 한 곳에서만, LIST-LIST-12).
class AppointmentListRow extends StatelessWidget {
  final AppointmentView view;
  final DateTime now;
  const AppointmentListRow({super.key, required this.view, required this.now});

  String _time() {
    final s = view.slotStart;
    return s == null ? '' : '${s.hour.toString().padLeft(2, '0')}:${s.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final st = listStatusLabel(view, now); // LIST-ST 표(상태 어휘)
    final who = view.forPatientName; // 이름(굵게) — LIST-LIST-09·10
    final rel = view.relation; // 관계(본인·딸) — 데모는 이름 옆에 회색으로 붙인다
    return Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
      // 시각 — 데모 w-12(48) 고정폭 굵은 숫자. 배경 없음(컬러 레일 폐기).
      // 칸 너비도 글자 배율(textScaler=rootFontScale)만큼 키운다 — 안 그러면 폰트가 커질 때
      // "13:00"이 48px를 넘쳐 두 줄로 쪼개진다(데모 w-12=rem이라 루트 커지면 함께 커짐).
      SizedBox(
        width: MediaQuery.textScalerOf(context).scale(48),
        child: Text(_time(),
            maxLines: 1,
            style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                fontFeatures: [FontFeature.tabularFigures()])),
      ),
      const SizedBox(width: AppTokens.densityRowGap),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Flexible(
              child: Text(who, // 누구 예약인지 먼저·굵게(LIST-LIST-10)
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            ),
            const SizedBox(width: 6),
            Text(rel, // 이름 옆 관계(본인·딸) — 데모 muted
                style: const TextStyle(fontSize: 13, color: AppTokens.grayPending)),
          ]),
          const SizedBox(height: 2),
          Text('${view.departmentName} · ${view.doctorName} 선생님', // 그 아래 진료과·의사
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: AppTokens.grayPending, fontSize: 13)),
        ]),
      ),
      // 오른쪽: 상태 글자(있으면·조용한 회색) 다음 › 하나. 버튼은 없다(LIST-LIST-11·12).
      if (st.label != null) ...[
        const SizedBox(width: 8),
        Text(st.label!, style: const TextStyle(fontSize: 13, color: AppTokens.grayPending)),
      ],
      const SizedBox(width: 4),
      const Icon(Icons.chevron_right,
          key: Key('list-chevron'), size: 20, color: AppTokens.grayPending),
    ]);
  }
}

/// LIST-LIST-06: 한 예약 = 한 상자(줄 + 문진 밴드). 데모대로 흰 카드 + 옅은 그림자(테두리 대신).
class AppointmentBox extends StatelessWidget {
  final AppointmentView view;
  final DateTime now;
  final Widget? questionnaireSlot; // LIST-QNR 밴드. null이면 줄만.
  final VoidCallback? onTap; // 줄 본문 탭 → 예약 상세(NAV-LIST-02, 화면이 주입)
  const AppointmentBox(
      {super.key, required this.view, required this.now, this.questionnaireSlot, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('appointment-box'),
      margin: const EdgeInsets.fromLTRB(16, 0, 16, AppTokens.densityListGap),
      clipBehavior: Clip.antiAlias, // 문진 밴드의 아래 모서리를 카드 라운드에 맞춰 자른다
      decoration: BoxDecoration(
        color: AppTokens.surface,
        borderRadius: BorderRadius.circular(AppTokens.densityCardRadius),
        boxShadow: AppTokens.cardElevation, // 공용 카드 그림자(데모 --elevation-card)
      ),
      child: Column(children: [
        InkWell(
          // 줄 본문만 탭 대상(NAV-LIST-02)
          onTap: onTap,
          child: Padding(
              padding: const EdgeInsets.all(AppTokens.densityRowPad),
              child: AppointmentListRow(view: view, now: now)),
        ),
        if (questionnaireSlot != null) questionnaireSlot!, // 같은 상자 안, 별도 탭(NAV-LIST-04)
      ]),
    );
  }
}
