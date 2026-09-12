import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api_client.dart';
import '../../core/providers.dart';
import 'hospital_hours_format.dart';

// 단일 병원 앱이라 이름은 앱 상수다 — get_public_hospital_info는 주소·전화만 준다(HSETX-SEC-01).
// 데모/시드와 같은 값(가온병원)으로 둔다. 병원이 바뀌면 이 한 곳만 고친다.
const String kHospitalName = '가온병원';
const String kHospitalDeskLabel = '환자 안내 데스크'; // SET-HOSP-06 상세위치 자리(백엔드 필드 없음 — 데모 문구)

/// [SET-HOSP-05] 진료시간·휴진일(㉯ 전용 창구 GET /catalog/hospital/hours). 주소·전화는 hospitalInfoProvider(홈) 재사용.
final hospitalHoursProvider = FutureProvider<HospitalHours>((ref) async {
  final ApiClient api = ref.watch(apiClientProvider);
  return api.get('/catalog/hospital/hours',
      (j) => HospitalHours.fromJson(Map<String, dynamic>.from(j as Map)));
});

/// tel:·지도 앱 열기를 seam으로 감싼다 — 테스트가 네트워크·플랫폼 없이 무엇을 열었는지 확인한다.
class LinkLauncher {
  const LinkLauncher();
  Future<bool> open(Uri uri) async {
    if (!await canLaunchUrl(uri)) return false;         // [SET-HOSP-09] 열 수 없으면 false → 화면이 오류 한 줄
    return launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}

final linkLauncherProvider = Provider<LinkLauncher>((ref) => const LinkLauncher());
