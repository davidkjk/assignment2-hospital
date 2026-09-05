import 'package:flutter/material.dart';
import '../../widgets/patient_app_bar.dart';
import 'package:hospital_patient_app/core/app_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/connectivity.dart';
import '../../core/providers.dart';
import '../../core/tokens.dart';
import '../home/home_data.dart' show hospitalInfoProvider, HospitalInfo;
import 'hospital_info_repository.dart' show kHospitalName;
import 'logout_confirm.dart';
import '../../widgets/hospital_logo.dart';

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
      appBar: const PatientAppBar(title: '설정'),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // ① 내 정보 — 이름·전화를 가리지 않고 보여주기만 한다(SET-HOME-05·06, 누를 수 없다).
          Container(
            key: const Key('block-myinfo'),
            decoration: BoxDecoration(
              color: AppTokens.surface,
              boxShadow: AppTokens.cardElevation,
              borderRadius: BorderRadius.circular(AppTokens.densityCardRadius),
            ),
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                const CircleAvatar(
                    backgroundColor: AppTokens.muted,
                    child: Icon(AppIcons.person, color: AppTokens.primary)),
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
          // SET-HOME-08 — 전화번호는 앱에서 못 바꾼다(AUTH-TEL 안내로). 내 정보 카드는 못 누르는
          // 블록이라(SET-HOME-06), 변경 링크는 카드 바로 아래 오른쪽에 은은하게 붙인다 —
          // 왼쪽에 홀로 떠 있던 파란 버튼의 이질감을 없앤다(Task10).
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              key: const Key('change-phone'),
              onPressed: () => context.push('/phone-change'),
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                foregroundColor: AppTokens.primary,
              ),
              child: const Row(mainAxisSize: MainAxisSize.min, children: [
                Text('전화번호 변경 안내', style: TextStyle(fontSize: 13)),
                Icon(AppIcons.chevron_right, size: 16),
              ]),
            ),
          ),
          const SizedBox(height: 8),

          // ② 알림
          _SettingsLink(
            key: const Key('go-notifications'),
            icon: AppIcons.notifications,
            label: '알림 설정',
            description: '받을 알림을 고를 수 있습니다',
            // SET-HOME-16 — 오프라인이면 비활성 + 이유.
            disabledReason: offline ? '인터넷에 연결되면 바꿀 수 있습니다' : null,
            onTap: () => context.push('/settings/notifications'),
          ),
          // ③ 계정 — 비밀번호 변경. 가족 관리는 설정에 두지 않는다(데모 DESIGN-NOTES:55 — 하단 가족 탭이
          // 담당, 본인 카드가 프로필 수정 자리). 정본 SET-HOME-10은 계정 블록에 가족 관리를 넣으라 하나
          // 데모/사용자 결정이 중복 제거로 뒤집음 → SET-HOME-10 재확인 필요(핸드오프에 남김).
          _SettingsLink(
            key: const Key('go-password'),
            icon: AppIcons.tune, // 데모 비밀번호 아이콘 = Settings2(가로 슬라이더) — 시각은 데모에 맞춘다
            label: '비밀번호 변경',
            description: '새 비밀번호를 설정합니다',
            onTap: () => context.push('/settings/password'),
          ),
          // ④ 병원
          _SettingsLink(
            key: const Key('go-hospital'),
            iconBuilder: (c) => HospitalLogo(size: 20, color: c), // 데모 Settings·직원웹과 같은 Hospital 심볼
            label: kHospitalName,
            description: _hospitalLine(hospital),
            onTap: () => context.push('/settings/hospital'),
          ),
          const SizedBox(height: 20),

          // ⑤ 로그아웃 — 평범한 버튼(붉은색 아님, SET-HOME-12). 누르면 확인 팝업(SET-OUT-03).
          // 데모 Button variant="outline" = border-transparent(테두리 없음) + bg-card + shadow-sm
          // (바깥 옅은 그림자). 이전 OutlinedButton은 반대(테두리 있고 그림자 없음)였다(2026-09-03 사용자).
          ElevatedButton.icon(
            key: const Key('logout-button'),
            onPressed: () => showLogoutConfirm(context, ref),
            icon: const Icon(AppIcons.logout, size: 18, color: AppTokens.primary),
            label: const Text('로그아웃'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTokens.surface, // 데모 bg-card
              foregroundColor: AppTokens.onSurface,
              elevation: 2,
              shadowColor: const Color(0x33102D32), // 데모 shadow-sm — 바깥 옅은 그림자(딥틸 톤)
              surfaceTintColor: Colors.transparent,
              minimumSize: const Size(double.infinity, 46), // 데모 w-full
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppTokens.densityCardRadius)),
            ),
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
    this.icon,
    this.iconBuilder,
    required this.label,
    required this.description,
    required this.onTap,
    this.disabledReason,
  }) : assert(icon != null || iconBuilder != null);
  final IconData? icon;
  /// 아이콘을 벡터 위젯으로 그릴 때(예: 병원 로고 SVG). 행 상태색(primary/회색)을 인자로 받는다.
  final Widget Function(Color color)? iconBuilder;
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
              // 데모 SettingsLink = rounded-xl border(옅은 테두리, 그림자 없음). 주요 카드(위 내 정보)만
              // 그림자, 이동 링크 같은 보조 컨테이너는 테두리로 위계를 나눈다(데모 2단 계층).
              decoration: BoxDecoration(
                color: AppTokens.surface,
                border: Border.all(color: AppTokens.border),
                borderRadius: BorderRadius.circular(AppTokens.densityCardRadius),
              ),
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Builder(builder: (_) {
                    final iconColor = _disabled ? AppTokens.grayPending : AppTokens.primary;
                    return iconBuilder != null
                        ? SizedBox(width: 20, height: 20, child: iconBuilder!(iconColor))
                        : Icon(icon, size: 20, color: iconColor);
                  }),
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
