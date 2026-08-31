import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/connectivity.dart';
import '../../core/providers.dart';
import '../../core/tokens.dart';
import '../home/home_data.dart' show hospitalInfoProvider, HospitalInfo;
import 'hospital_info_repository.dart' show kHospitalName;

class MyProfile {
  const MyProfile({required this.name, this.phone});
  final String name;
  final String? phone;
}

/// [SET-HOME-05] 내 정보(이름·전화). GET /patient/me. 실패해도 화면은 열린다(SET-HOME-15) → null 반환.
final myProfileProvider = FutureProvider<MyProfile?>((ref) async {
  try {
    final ApiClient api = ref.watch(apiClientProvider);
    return api.get('/patient/me',
        (j) => MyProfile(name: (j as Map)['name'] as String? ?? '', phone: j['phone'] as String?));
  } catch (_) {
    return null;
  }
});

/// [SET-HOME-*][갭 #70] 설정 홈 — 6블록. 민감 경로(T14 가드가 /settings 진입 시 재인증을 이미 지킨다).
class SettingsHomeScreen extends ConsumerWidget {
  const SettingsHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(myProfileProvider).valueOrNull;
    final HospitalInfo? hospital = ref.watch(hospitalInfoProvider).valueOrNull;
    final offline = ref.watch(connectivityProvider).valueOrNull == false;

    return Scaffold(
      appBar: AppBar(title: const Text('설정')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // ① 내 정보 — 이름·전화를 가리지 않고 보여주기만 한다(SET-HOME-05·06, 누를 수 없다).
          Container(
            key: const Key('block-myinfo'),
            decoration: BoxDecoration(
              color: AppTokens.surface,
              border: Border.all(color: AppTokens.border),
              borderRadius: BorderRadius.circular(12),
            ),
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                const CircleAvatar(
                    backgroundColor: AppTokens.muted,
                    child: Icon(Icons.person_outline, color: AppTokens.primary)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(me?.name ?? '',
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                      if (me?.phone != null) ...[
                        const SizedBox(height: 2),
                        Text(me!.phone!,
                            style: const TextStyle(fontSize: 14, color: AppTokens.grayPending)),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
          // SET-HOME-08 — 전화번호는 앱에서 못 바꾼다. AUTH-TEL 안내로.
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              key: const Key('change-phone'),
              onPressed: () => context.push('/phone-change'),
              child: const Text('전화번호 변경'),
            ),
          ),
          const SizedBox(height: 12),

          // ② 알림
          _SettingsLink(
            key: const Key('go-notifications'),
            icon: Icons.notifications_outlined,
            label: '알림 설정',
            description: '받을 알림을 고를 수 있습니다',
            // SET-HOME-16 — 오프라인이면 비활성 + 이유.
            disabledReason: offline ? '인터넷에 연결되면 바꿀 수 있습니다' : null,
            onTap: () => context.push('/settings/notifications'),
          ),
          // ③ 계정 — 비밀번호 변경 · 가족 관리 두 줄(SET-HOME-10).
          _SettingsLink(
            key: const Key('go-password'),
            icon: Icons.lock_outline,
            label: '비밀번호 변경',
            description: '새 비밀번호를 설정합니다',
            onTap: () => context.push('/settings/password'),
          ),
          _SettingsLink(
            key: const Key('go-family'),
            icon: Icons.people_outline,
            label: '가족 관리',
            description: '연결된 가족의 정보를 관리합니다',
            onTap: () => context.push('/family'), // NAV-SET-06 (재인증 다시 안 물음 — 방금 통과)
          ),
          // ④ 병원
          _SettingsLink(
            key: const Key('go-hospital'),
            icon: Icons.local_hospital_outlined,
            label: kHospitalName,
            description: _hospitalLine(hospital),
            onTap: () => context.push('/settings/hospital'),
          ),
          const SizedBox(height: 20),

          // ⑤ 로그아웃 — 평범한 버튼(붉은색 아님, SET-HOME-12). 실동작은 T29가 갈아끼운다.
          OutlinedButton.icon(
            key: const Key('logout-button'),
            onPressed: () => context.push('/settings/logout'),
            icon: const Icon(Icons.logout, size: 18, color: AppTokens.primary),
            label: const Text('로그아웃'),
          ),
          const SizedBox(height: 8),
          // ⑥ 회원 탈퇴 — 맨 아래 작은 회색 밑줄(버튼 아님, SET-HOME-13·14).
          Center(
            child: TextButton(
              onPressed: () => context.push('/settings/withdraw'),
              child: const Text('회원 탈퇴',
                  key: Key('withdraw-text'),
                  style: TextStyle(
                      fontSize: 13,
                      color: AppTokens.grayPending,
                      decoration: TextDecoration.underline)),
            ),
          ),
        ],
      ),
    );
  }

  static String _hospitalLine(HospitalInfo? h) {
    if (h == null) return '';
    final phone = h.phone ?? '';
    final district = _district(h.address);
    return [phone, if (district != null) district].join(' · ');
  }

  static String? _district(String? address) {
    if (address == null) return null;
    final m = RegExp(r'(\S+구)').firstMatch(address);
    return m?.group(1);
  }
}

class _SettingsLink extends StatelessWidget {
  const _SettingsLink({
    super.key,
    required this.icon,
    required this.label,
    required this.description,
    required this.onTap,
    this.disabledReason,
  });
  final IconData icon;
  final String label, description;
  final VoidCallback onTap;
  final String? disabledReason;

  bool get _disabled => disabledReason != null;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            onTap: _disabled ? null : onTap,
            borderRadius: BorderRadius.circular(12),
            child: Container(
              decoration: BoxDecoration(
                color: AppTokens.surface,
                border: Border.all(color: AppTokens.border),
                borderRadius: BorderRadius.circular(12),
              ),
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Icon(icon, size: 20, color: _disabled ? AppTokens.grayPending : AppTokens.primary),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          Text(label,
                              style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w500,
                                  color: _disabled ? AppTokens.grayPending : AppTokens.onSurface)),
                          const SizedBox(width: 4),
                          if (!_disabled) const Text('›', style: TextStyle(color: AppTokens.primary)),
                        ]),
                        if (description.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(description,
                              style: const TextStyle(fontSize: 13, color: AppTokens.grayPending)),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (_disabled)
            Padding(
              padding: const EdgeInsets.only(top: 4, left: 4),
              child: Text(disabledReason!,
                  style: const TextStyle(fontSize: 13, color: AppTokens.warn)),
            ),
        ],
      ),
    );
  }
}
