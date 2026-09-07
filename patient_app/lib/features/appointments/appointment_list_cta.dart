import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import 'package:hospital_patient_app/core/button_sizes.dart';
import 'package:hospital_patient_app/widgets/action_button.dart';

/// LIST-CTA: 목록 하단에 늘 있는 「+ 새 예약하기」 하나. 빈 상태·오프라인·실패 어느 분기에서도
/// 하단에 있어 막다른 길을 만들지 않는다(LIST-CTA-01·02·03). 오프라인이면 비활성 + 이유(숨기지 않는다).
class AppointmentListCta extends StatelessWidget {
  final bool offline;
  final VoidCallback onNewBooking;
  const AppointmentListCta({super.key, required this.offline, required this.onNewBooking});

  @override
  Widget build(BuildContext context) {
    // #15(2026-09-07 사용자 요구): 배경 패널 없이(투명) + 위로 뜨는 옅은 그림자로만 리스트와 가른다.
    //   (예약상세는 흰 바로 확정했으나, 예약 탭 새예약하기는 단일 주 버튼이라 「배경 제거+그림자」로.)
    //   cta 버튼(h-12=48)은 tapPad 0이라 여백 보정이 필요 없다.
    // 2026-09-07 사용자 요구: 배경·그림자 없음 — 버튼만 리스트 위에 떠 있다(리스트가 버튼 뒤로 스크롤).
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: ActionButton(
        label: '+ 새 예약하기',
        busyLabel: '+ 새 예약하기', // 마법사로의 이동이라 busy 없음(라벨과 동일)
        icon: AppIcons.calendar_month, // 데모 MyAppointments footer: <CalendarPlus/> + 새 예약하기
        style: AppButtonSize.cta, // 데모 MyAppointments footer: size=lg h-12 text-base
        onPressed: onNewBooking, // LIST-CTA-04: 예약 1단계로
        // LIST-CTA-05(=BTN-STATE-03·OFF-DO-02): 오프라인이면 비활성 + 이유 문구(숨기지 않는다).
        disabledReason: offline ? '오프라인 상태에서는 예약할 수 없어요. 연결되면 예약할 수 있습니다.' : null,
      ),
    );
  }
}
