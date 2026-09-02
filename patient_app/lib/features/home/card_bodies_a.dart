import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../../core/tokens.dart';
import '../../core/wait_format.dart';
import '../../widgets/dashed_border.dart';
import 'appointment_view.dart';

/// 점선 QR 자리 — 상태 A의 가운데에 QR 대신 놓인다(REQ-03·UNCONF-05). 실제 QR 위젯은 그리지 않는다.
/// 데모 정본: 점선 사각 안에 QR 아이콘 + 아래 안내 문구.
class _QrPlaceholder extends StatelessWidget {
  const _QrPlaceholder(this.text);
  final String text;
  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // 데모: h-20 w-20 rounded-lg border border-dashed(준비 어포던스). 확정 QR만 실선.
        SizedBox(
          width: 80,
          height: 80,
          child: DottedBorder(
            color: AppTokens.border, // 데모 border-dashed = --border 색
            radius: 10, // 데모 rounded-lg
            child: Center(
              child: SvgPicture.asset('assets/icons/qr_code_fill.svg', // 데모 Phosphor QrCode(fill) h-10
                  width: 40,
                  height: 40,
                  colorFilter: const ColorFilter.mode(AppTokens.primary, BlendMode.srcIn)),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(text,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppTokens.grayPending, fontSize: 13)),
      ],
    );
  }
}

/// CARD-REQ-03 — 확인 중 본문. QR 대신 안내 문구. compact면 목록의 [QR] 자리에 「확인 중」(REQ-06).
class ReqBody extends StatelessWidget {
  final bool compact;
  const ReqBody({super.key, this.compact = false});
  @override
  Widget build(BuildContext context) {
    if (compact) return const Text('확인 중'); // REQ-06
    return const _QrPlaceholder('확정되면 여기에 접수용 QR이 나타납니다'); // REQ-03(소요 시간 문구 없음 — REQ-05)
  }
}

/// CARD-WAIT — 진료대기 본문. 서버 계산을 표시만: 내 앞 인원 + 대기시간(빈 줄이면 접음) + 고정 문장.
class WaitBody extends StatelessWidget {
  final QueueStatus? queue;
  const WaitBody({super.key, this.queue});
  @override
  Widget build(BuildContext context) {
    final q = queue;
    final waitLine = q == null
        ? ''
        : formatWaitTime(patientsAhead: q.patientsAhead, minutes: q.estimatedWaitMinutes);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SvgPicture.asset('assets/icons/pulse_fill.svg', // 데모 Activity=Phosphor Pulse(fill)
            width: 32,
            height: 32,
            colorFilter: const ColorFilter.mode(AppTokens.primary, BlendMode.srcIn)),
        const SizedBox(height: 4),
        if (q != null)
          Text('내 앞에 ${q.patientsAhead}명',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)), // WAIT-01·09
        if (waitLine.isNotEmpty)
          Text(waitLine,
              style: const TextStyle(color: AppTokens.grayPending)), // WAIT-04: 근거 없으면 접는다
        const SizedBox(height: 2),
        const Text('예상 대기시간은 변동될 수 있습니다',
            style: TextStyle(color: AppTokens.grayPending, fontSize: 12)), // WAIT-02(글자 그대로)
      ],
    );
  }
}

/// CARD-UNCONF-05 — 확정되지 않음 본문. QR 대신 안내 문구(QR 없음).
class UnconfBody extends StatelessWidget {
  const UnconfBody({super.key});
  @override
  Widget build(BuildContext context) {
    return const _QrPlaceholder('아직 확정되지 않아 접수용 QR이 없습니다');
  }
}
