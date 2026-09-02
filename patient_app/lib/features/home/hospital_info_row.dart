import 'package:flutter/material.dart';

import '../../core/tokens.dart';

/// 병원 주소·전화 정보(HOME-INFO-01·02). 조회 실패 시 이 위젯을 아예 그리지 않는다(HOME-INFO-02는 화면 몫).
/// 주소 탭 → 지도, 전화 탭 → 전화 앱(HOME-INFO-03·NAV-HOME-09·10).
class HospitalInfoRow extends StatelessWidget {
  const HospitalInfoRow({
    super.key,
    required this.address,
    required this.phone,
    this.onTapAddress,
    this.onTapPhone,
  });
  final String address;
  final String phone;
  final VoidCallback? onTapAddress;
  final VoidCallback? onTapPhone;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _line(Icons.place, address, onTapAddress), // HOME-INFO-01: 주소
        const SizedBox(height: 6),
        _line(Icons.call, phone, onTapPhone), // HOME-INFO-01: 전화
      ],
    );
  }

  Widget _line(IconData icon, String text, VoidCallback? onTap) => InkWell(
        onTap: onTap,
        child: Row(children: [
          Icon(icon, size: 18, color: AppTokens.grayPending),
          const SizedBox(width: 6),
          Expanded(child: Text(text, style: const TextStyle(color: AppTokens.grayPending))),
        ]),
      );
}
