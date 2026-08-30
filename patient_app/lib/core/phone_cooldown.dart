import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// 인증번호 재발송·새로고침 등 「다시 누르는 것이 정상 동작」인 버튼의 쿨다운을, 화면이 아니라
/// **전화번호 기준**으로 관리한다(BTN-COOL-04·05). 재시작에도 유지되도록 저장한다.
class PhoneCooldownStore {
  static const int cooldownSeconds = 30;
  static const String _key = 'phone_cooldown';

  final FlutterSecureStorage _storage;
  final Map<String, DateTime> _startedAt = {};

  PhoneCooldownStore(this._storage);

  /// 앱 시작 시 한 번 불러 재시작 전 쿨다운을 되살린다(BTN-COOL-04·05·07).
  Future<void> load() async {
    final raw = await _storage.read(key: _key);
    if (raw == null) return;
    final m = jsonDecode(raw) as Map<String, dynamic>;
    _startedAt
      ..clear()
      ..addAll(m.map((k, v) => MapEntry(k, DateTime.parse(v as String))));
  }

  Future<void> _persist() => _storage.write(
      key: _key,
      value: jsonEncode(_startedAt.map((k, v) => MapEntry(k, v.toIso8601String()))));

  /// BTN-COOL-01·04: 재발송 등을 눌렀을 때 그 번호에 쿨다운을 시작한다.
  Future<void> start(String phone, DateTime at) async {
    _startedAt[phone] = at;
    await _persist();
  }

  /// BTN-COOL-06·10: 서버가 거절하며 내려준 남은 초로 로컬을 맞춘다. 서버가 진실이다.
  Future<void> syncFromServer(String phone, int remaining, DateTime now) async {
    _startedAt[phone] = now.subtract(Duration(seconds: cooldownSeconds - remaining));
    await _persist();
  }

  /// 남은 초(BTN-COOL-02·08). BTN-COOL-03: 횟수가 아니라 시간만 본다.
  /// BTN-COOL-09: 시작한 적 없는 번호는 0(정상 발송).
  int remainingSeconds(String phone, DateTime now) {
    final s = _startedAt[phone];
    if (s == null) return 0;
    final left = cooldownSeconds - now.difference(s).inSeconds;
    return left > 0 ? left : 0;
  }
}

final phoneCooldownStoreProvider = Provider<PhoneCooldownStore>(
    (ref) => PhoneCooldownStore(const FlutterSecureStorage()));
