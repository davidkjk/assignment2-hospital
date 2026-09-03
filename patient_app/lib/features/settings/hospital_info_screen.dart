import 'package:flutter/material.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/tokens.dart';
import '../../widgets/inline_error.dart';
import '../home/home_data.dart' show hospitalInfoProvider, HospitalInfo;
import 'hospital_hours_format.dart';
import 'hospital_info_repository.dart';

/// [SET-HOSP-*] 병원 정보 — 전화(가장 크게)·진료시간·주소·길찾기. 주소·전화는 hospitalInfoProvider 재사용,
/// 진료시간은 ㉯ 전용 창구(hospitalHoursProvider). 이름은 앱 상수(백엔드에 이름 필드 없음).
class HospitalInfoScreen extends ConsumerStatefulWidget {
  const HospitalInfoScreen({super.key});

  @override
  ConsumerState<HospitalInfoScreen> createState() => _HospitalInfoScreenState();
}

class _HospitalInfoScreenState extends ConsumerState<HospitalInfoScreen> {
  String? _mapError;

  Future<void> _call(String? phone) async {
    if (phone == null || phone.isEmpty) return;
    final digits = phone.replaceAll(RegExp(r'[^0-9]'), '');
    await ref.read(linkLauncherProvider).open(Uri.parse('tel:$digits')); // [SET-HOSP-04]
  }

  Future<void> _openMap(String? address) async {
    if (address == null || address.isEmpty) return;
    // [SET-HOSP-07·08] 좌표가 아니라 주소 문자열을 지도 앱에 넘긴다.
    final uri = Uri.parse('https://maps.google.com/?q=${Uri.encodeComponent(address)}');
    final ok = await ref.read(linkLauncherProvider).open(uri);
    setState(() => _mapError = ok ? null : '지도 앱을 열 수 없습니다.'); // [SET-HOSP-09] 막다른 길 아님
  }

  @override
  Widget build(BuildContext context) {
    final HospitalInfo? info = ref.watch(hospitalInfoProvider).valueOrNull;
    final hoursAsync = ref.watch(hospitalHoursProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('병원 정보')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Container(
            decoration: BoxDecoration(
              color: AppTokens.surface,
              boxShadow: AppTokens.cardElevation,
              borderRadius: BorderRadius.circular(AppTokens.densityCardRadius),
            ),
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(kHospitalName,
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                const Text(kHospitalDeskLabel,
                    style: TextStyle(fontSize: 14, color: AppTokens.grayPending)),
                const SizedBox(height: 20),
                // [SET-HOSP-02·03] 전화 걸기 — 가장 크게, 번호를 함께. 어르신이 바로 누르게.
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    key: const Key('call-button'),
                    onPressed: () => _call(info?.phone),
                    icon: const Icon(AppIcons.phone),
                    label: Text('전화 걸기   ${info?.phone ?? ''}',
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppTokens.primary,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // ── 진료시간 카드(SET-HOSP-05) ── 조회 실패·오프라인이어도 전화·주소는 위에서 동작한다.
          _SectionCard(
            title: '진료시간',
            child: hoursAsync.when(
              loading: () => const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text('불러오는 중…', style: TextStyle(color: AppTokens.grayPending))),
              error: (_, __) => const InlineError('진료시간을 불러오지 못했습니다.'),
              data: (h) => _HoursLines(formatHospitalHours(h)),
            ),
          ),
          const SizedBox(height: 16),

          // ── 주소 + 길찾기(SET-HOSP-06·07) ──
          _SectionCard(
            title: '주소',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(info?.address ?? '',
                    style: const TextStyle(fontSize: 15, height: 1.4)),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    key: const Key('map-button'),
                    onPressed: () => _openMap(info?.address),
                    icon: const Icon(AppIcons.map),
                    label: const Text('지도 앱으로 길 찾기'),
                  ),
                ),
                if (_mapError != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: InlineError(_mapError),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.child});
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(
          color: AppTokens.surface,
          boxShadow: AppTokens.cardElevation,
          borderRadius: BorderRadius.circular(AppTokens.densityCardRadius),
        ),
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style: const TextStyle(
                    fontSize: 14, fontWeight: FontWeight.w600, color: AppTokens.grayPending)),
            const SizedBox(height: 10),
            child,
          ],
        ),
      );
}

class _HoursLines extends StatelessWidget {
  const _HoursLines(this.lines);
  final HospitalHoursLines lines;

  @override
  Widget build(BuildContext context) {
    final rows = <String>[
      if (lines.weekday.isNotEmpty) lines.weekday,
      if (lines.saturday.isNotEmpty) lines.saturday,
      if (lines.lunch.isNotEmpty) lines.lunch,
      if (lines.closed.isNotEmpty) '휴진일 ${lines.closed}',
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final r in rows)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Text(r, style: const TextStyle(fontSize: 15, height: 1.4)),
          ),
      ],
    );
  }
}
