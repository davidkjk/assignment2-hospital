import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/providers.dart';

/// [SET-NOTI-12] 알림 선호 6토글의 서버 창구. GET로 6키, PATCH로 한 토글 즉시 저장.
/// 값은 서버가 접은 6토글(Map<group,bool>)이다 — 화면은 종류를 몰라도 된다.
class NotificationPrefsRepository {
  NotificationPrefsRepository(this._api);
  final ApiClient _api;

  Future<Map<String, bool>> getPrefs() =>
      _api.get('/me/notification-preferences', _parse);

  Future<Map<String, bool>> setPref(String group, bool enabled) => _api.patch(
      '/me/notification-preferences', {'group': group, 'enabled': enabled}, _parse);

  Map<String, bool> _parse(dynamic j) =>
      (j as Map).map((k, v) => MapEntry(k as String, v as bool));
}

final notificationPrefsRepositoryProvider = Provider<NotificationPrefsRepository>(
    (ref) => NotificationPrefsRepository(ref.watch(apiClientProvider)));

class NotificationSettingsState {
  const NotificationSettingsState({
    this.prefs = const {},
    this.busy = const {},
    this.errorFor = const {},
    this.loading = true,
    this.loadError = false,
  });
  final Map<String, bool> prefs;
  final Set<String> busy;              // [SET-NOTI-14] 저장 중인 토글(그 줄만 잠근다)
  final Map<String, String> errorFor;  // [SET-NOTI-13] 줄별 오류
  final bool loading;
  final bool loadError;

  NotificationSettingsState copyWith({
    Map<String, bool>? prefs,
    Set<String>? busy,
    Map<String, String>? errorFor,
    bool? loading,
    bool? loadError,
  }) =>
      NotificationSettingsState(
        prefs: prefs ?? this.prefs,
        busy: busy ?? this.busy,
        errorFor: errorFor ?? this.errorFor,
        loading: loading ?? this.loading,
        loadError: loadError ?? this.loadError,
      );
}

class NotificationSettingsController extends StateNotifier<NotificationSettingsState> {
  NotificationSettingsController(this.repo) : super(const NotificationSettingsState());
  final NotificationPrefsRepository repo;

  Future<void> load() async {
    try {
      state = state.copyWith(prefs: await repo.getPrefs(), loading: false, loadError: false);
    } catch (_) {
      state = state.copyWith(loading: false, loadError: true);
    }
  }

  /// [SET-NOTI-12] 스위치를 움직이면 그 자리에서 저장한다([저장] 버튼 없음).
  /// [SET-NOTI-13] 실패면 스위치를 원래 자리로 되돌리고 그 줄에 오류. [SET-NOTI-14] 그 토글만 busy.
  Future<void> toggle(String group, bool value) async {
    final prev = state.prefs[group] ?? true;
    state = state.copyWith(
      prefs: {...state.prefs, group: value},        // 낙관적 반영
      busy: {...state.busy, group},                 // 그 줄만 busy
      errorFor: {...state.errorFor}..remove(group), // 이전 오류 지움
    );
    try {
      final fresh = await repo.setPref(group, value);
      state = state.copyWith(prefs: fresh, busy: {...state.busy}..remove(group));
    } catch (_) {
      state = state.copyWith(
        prefs: {...state.prefs, group: prev},       // ⭐ 되돌림 — 켜진 채로 두면 온다고 믿는다
        busy: {...state.busy}..remove(group),
        errorFor: {...state.errorFor, group: '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'},
      );
    }
  }
}

final notificationSettingsControllerProvider = StateNotifierProvider<
    NotificationSettingsController, NotificationSettingsState>(
  (ref) => NotificationSettingsController(ref.watch(notificationPrefsRepositoryProvider)),
);
