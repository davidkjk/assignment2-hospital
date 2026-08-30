import 'package:flutter/material.dart';
import '../../core/tokens.dart';
import 'appointment_view.dart';

// 상태 B(확정·도착·진료중·완료·취소·지연·오프라인)의 카드 가운데 132 박스 본문.
// 데모 StatusCard의 StatusBody 정본을 그대로 옮긴다(색·아이콘·문구·정렬).

const _muted = AppTokens.grayPending; // 데모 text-muted-foreground

/// 가운데 세로 정렬 본문의 공통 틀(아이콘 + 굵은 줄 + 옅은 줄).
class _CenterBody extends StatelessWidget {
  const _CenterBody({required this.icon, required this.title, this.subtitle, this.dimTitle = false});
  final IconData icon;
  final String title;
  final String? subtitle;
  final bool dimTitle; // 완료·취소는 제목까지 옅은 회색(데모 text-muted-foreground 컨테이너)

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 34, color: AppTokens.primary),
        const SizedBox(height: 6),
        Text(title,
            textAlign: TextAlign.center,
            style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: dimTitle ? _muted : AppTokens.onSurface)),
        if (subtitle != null)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(subtitle!,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 13, color: _muted)),
          ),
      ],
    );
  }
}

/// CARD-OK / CARD-LATE — 접수용 QR 미리보기. 카드 안에는 실제 QR을 그리지 않고(작아서 못 씀)
/// QR 아이콘 + 예약번호 + 「눌러서 크게 보기 ›」를 놓고 누르면 전체화면으로 보낸다(NAV-HOME-02).
class QrPreviewBody extends StatelessWidget {
  const QrPreviewBody({super.key, required this.view, this.onTap});
  final AppointmentView view;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final code = view.bookingCode;
    if (code == null || code.isEmpty) {
      // CARD-OK-03 — 아직 번호가 없으면 점선 자리 + 준비 중 안내(당일 부도 전엔 null 안 됨).
      return Column(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              border: Border.all(color: AppTokens.grayPending),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.qr_code_2, size: 40, color: AppTokens.primary),
          ),
          const SizedBox(height: 8),
          const Text('접수용 QR을 준비 중입니다',
              style: TextStyle(color: _muted, fontSize: 13)),
        ],
      );
    }
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: AppTokens.border),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.qr_code_2, size: 52, color: AppTokens.primary),
          ),
          const SizedBox(width: 16),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('접수용 QR',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
              const SizedBox(height: 2),
              Text('예약번호 $code', style: const TextStyle(fontSize: 13, color: _muted)),
              const SizedBox(height: 4),
              const Text('눌러서 크게 보기 ›',
                  style: TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w600, color: AppTokens.primary)),
            ],
          ),
        ],
      ),
    );
  }
}

/// CARD-IN — 도착(접수됨). QR이 사라지고 접수됨 + 순서 준비 중(내 앞 N명 안 씀 — 아직 순서 미정, CARD-IN-02).
class InBody extends StatelessWidget {
  const InBody({super.key});
  @override
  Widget build(BuildContext context) => const _CenterBody(
      icon: Icons.check_circle, title: '접수되었습니다', subtitle: '순서를 준비 중입니다');
}

/// CARD-DOC — 진료중. 대기 인원 숫자 없음(내 앞에 0명은 이상하다, CARD-DOC-01).
class DocBody extends StatelessWidget {
  const DocBody({super.key});
  @override
  Widget build(BuildContext context) => const _CenterBody(
      icon: Icons.medical_services, title: '진료 중입니다', subtitle: '보호자분은 잠시 대기해 주세요');
}

/// CARD-DONE — 진료완료. 옅은 회색 + 진료가 끝났습니다(CARD-DONE-01).
class DoneBody extends StatelessWidget {
  const DoneBody({super.key});
  @override
  Widget build(BuildContext context) =>
      const _CenterBody(icon: Icons.check, title: '진료가 끝났습니다', dimTitle: true);
}

/// CARD-CXL — 취소됨(옅은 회색). 주체 3갈래: 병원 / 가족(관계·이름) / 본인.
class CxlBody extends StatelessWidget {
  const CxlBody({super.key, required this.view});
  final AppointmentView view;

  @override
  Widget build(BuildContext context) {
    final IconData icon;
    final String title;
    if (view.cancelledBy == 'hospital') {
      icon = Icons.local_hospital; // CARD-CXL-02: 병원에서 취소했습니다(직원 이름 없음)
      title = '병원에서 취소했습니다';
    } else if (!view.isSelf &&
        (view.cancelledByRelation != null || view.cancelledByName != null)) {
      // CARD-CXL-03: 가족이 대행 취소 — 관계 + 이름
      icon = Icons.cancel;
      final rel = view.cancelledByRelation ?? view.relation;
      final name = view.cancelledByName ?? view.forPatientName;
      title = '$rel $name 님이 취소했습니다';
    } else {
      icon = Icons.cancel; // CARD-CXL-04: 본인 취소
      title = '취소하셨습니다';
    }
    return _CenterBody(icon: icon, title: title, dimTitle: true);
  }
}

/// CARD-OFF-03 — 오프라인일 때 도착·대기·진료중 카드의 가운데. 낡은 숫자·기준 시각을 보이지 않고 문장만.
class OfflineBody extends StatelessWidget {
  const OfflineBody({super.key});
  @override
  Widget build(BuildContext context) => const Center(
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: 8),
          child: Text('순서는 인터넷이 연결되어야 확인할 수 있습니다',
              textAlign: TextAlign.center, style: TextStyle(color: _muted, fontSize: 14)),
        ),
      );
}
