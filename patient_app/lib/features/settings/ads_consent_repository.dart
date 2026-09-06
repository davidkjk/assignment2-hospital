import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/providers.dart';

/// #38(2026-09-05) — 광고성 정보 수신 동의(선택). 가입 때만 정하던 것을 설정에서도 켜고 끌 수 있게.
/// GET /patient/me(ads_consent 포함) · PATCH /patient/me/ads-consent {agreed}. 정보성 알림 6토글
/// (notification-preferences)과는 별개 창구 — 광고는 법적 수신동의라 동의 테이블에 시각과 함께 기록된다.
class AdsConsentRepository {
  AdsConsentRepository(this._api);
  final ApiClient _api;

  Future<bool> get() => _api.get('/patient/me', (j) => (j as Map)['ads_consent'] == true);

  Future<bool> set(bool agreed) =>
      _api.patch('/patient/me/ads-consent', {'agreed': agreed}, (j) => (j as Map)['ads_consent'] == true);
}

final adsConsentRepositoryProvider =
    Provider<AdsConsentRepository>((ref) => AdsConsentRepository(ref.watch(apiClientProvider)));

class AdsConsentState {
  const AdsConsentState({this.agreed = false, this.loading = true, this.busy = false, this.error});
  final bool agreed, loading, busy;
  final String? error;
  AdsConsentState copyWith({bool? agreed, bool? loading, bool? busy, String? error}) => AdsConsentState(
      agreed: agreed ?? this.agreed,
      loading: loading ?? this.loading,
      busy: busy ?? this.busy,
      error: error);
}

class AdsConsentController extends StateNotifier<AdsConsentState> {
  AdsConsentController(this._repo) : super(const AdsConsentState());
  final AdsConsentRepository _repo;

  Future<void> load() async {
    try {
      state = state.copyWith(agreed: await _repo.get(), loading: false);
    } catch (_) {
      state = state.copyWith(loading: false); // 조용히 실패 — 토글은 현재값(기본 꺼짐)으로 둔다
    }
  }

  Future<void> toggle(bool value) async {
    final prev = state.agreed;
    state = state.copyWith(agreed: value, busy: true, error: null); // 낙관적 반영
    try {
      final fresh = await _repo.set(value);
      state = state.copyWith(agreed: fresh, busy: false);
    } catch (_) {
      state = state.copyWith(agreed: prev, busy: false, error: '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }
}

final adsConsentControllerProvider =
    StateNotifierProvider<AdsConsentController, AdsConsentState>(
        (ref) => AdsConsentController(ref.watch(adsConsentRepositoryProvider)));
