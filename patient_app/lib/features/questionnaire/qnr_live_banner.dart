import 'package:flutter/material.dart';
import '../../widgets/warn_text.dart'; // WarnText(T0) — 주의색 세로줄 ▌(새 모양을 만들지 않는다)

/// QNR-LIVE-02·03·04: 문진을 쓰던 중 예약이 취소됐을 때의 안내.
/// 취소 주체 3갈래는 카드(CARD-CXL 계열)와 같은 값·같은 말투를 쓴다 — 새 문구 체계를 만들지 않는다.
class QnrCancelledBanner extends StatelessWidget {
  const QnrCancelledBanner({
    super.key,
    required this.cancelledBy,
    required this.isSelf,
    this.relation,
    this.name,
    this.onAcknowledge,
  });
  final String cancelledBy; // 'hospital' | 'patient'
  final bool isSelf;
  final String? relation, name;
  final VoidCallback? onAcknowledge;

  String get _actor {
    if (cancelledBy == 'hospital') return '병원에서 취소'; // QNR-LIVE-03 ①
    if (!isSelf) return '$relation $name 님이 취소'; // ② 가족(이름 문자열이 아니라 isSelf로 판정)
    return '취소하셨습니다'; // ③ 본인
  }

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          WarnText('이 예약이 취소되었습니다 · $_actor'),
          const SizedBox(height: 4),
          const Text('지금까지 작성하신 내용은 그대로 남습니다.'), // QNR-LIVE-05를 말로도 알린다
          // QNR-LIVE-04: 병원발만 [확인]. 본인·가족이 한 일은 눌러 지울 것이 없다.
          if (cancelledBy == 'hospital')
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(onPressed: onAcknowledge, child: const Text('확인')),
            ),
        ],
      );
}
