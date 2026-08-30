import 'package:flutter/material.dart';

import '../../core/tokens.dart';
import '../../core/wait_format.dart';
import '../../widgets/action_button.dart';
import 'appointment_view.dart';

/// HOME-CARD-02·03 — 그날 예약이 2건 이상일 때 사람별 줄로 묶은 카드.
/// 각 줄 = 시각 레일 + 대상자 이름(+본인/가족) + (확정이면 [QR], 신청 중이면 「확인 중」 글자 CARD-REQ-06).
/// ⚠️ AppCard(T0)는 본문 132px 고정이라 여러 줄엔 못 쓴다 — 같은 테두리 스타일의 자체 컨테이너로 그린다.
/// 정렬은 selectHomeDay가 이미 함(빠른 시각 위·본인 먼저).
class HomeMultiCard extends StatelessWidget {
  const HomeMultiCard({super.key, required this.views, this.onQr, this.onRow});
  final List<AppointmentView> views;
  final void Function(AppointmentView)? onQr; // [QR] → /qr/:id (NAV-HOME-02)
  final void Function(AppointmentView)? onRow; // 줄 탭 → /appointments/:id (NAV-HOME-01)

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: AppTokens.grayPending),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          for (var i = 0; i < views.length; i++) ...[
            if (i > 0) const Divider(height: 1, color: AppTokens.grayDone),
            _row(views[i]),
          ],
        ],
      ),
    );
  }

  Widget _row(AppointmentView v) {
    final isReq = v.status == '예약신청'; // 확정 전 = QR 없음(확인 중)
    return InkWell(
      onTap: onRow == null ? null : () => onRow!(v),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        child: Row(
          children: [
            // 시각 레일
            SizedBox(
              width: 72,
              child: Text(v.slotStart == null ? '' : formatKoreanTime(v.slotStart!),
                  style: const TextStyle(fontWeight: FontWeight.w600)),
            ),
            // 이름 + 관계
            Expanded(
              child: Text('${v.forPatientName}${v.isSelf ? ' · 본인' : ' · 가족'}'),
            ),
            // 확정이면 [QR], 신청 중이면 「확인 중」
            if (isReq)
              const Text('확인 중', style: TextStyle(color: AppTokens.grayPending)) // CARD-REQ-06
            else
              SizedBox(
                width: 96,
                child: ActionButton(
                    label: 'QR', busyLabel: '여는 중…', onPressed: onQr == null ? () {} : () => onQr!(v)),
              ),
          ],
        ),
      ),
    );
  }
}
