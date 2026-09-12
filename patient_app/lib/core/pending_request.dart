import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// BTN-KILL-06 — 유언을 남기는 동작은 **다시 하면 결과가 하나 더 생기는 것**뿐이다:
/// 예약 신청·예약 변경. 문진 저장·취소·연결 해제·탈퇴는 두 번 해도 결과가 같아 대상이 아니다.
enum PendingKind { book, change }

/// 오전/오후 12시간제 한국어 시각. BTN-KILL-04: "방금" 대신 이 절대 시각을 문구에 넣는다
/// (배터리 방전이면 몇 시간 뒤에 켤 수 있어 "방금"은 사실이 아니게 된다).
String koreanTime(DateTime t) {
  final ampm = t.hour < 12 ? '오전' : '오후';
  var h = t.hour % 12;
  if (h == 0) h = 12;
  return '$ampm $h:${t.minute.toString().padLeft(2, '0')}';
}

class PendingRequest {
  final PendingKind kind;
  final DateTime? startedAt; // 저장에서 읽으면 채워진다
  const PendingRequest(this.kind, this.startedAt);

  Map<String, dynamic> toJson() =>
      {'kind': kind.name, 'startedAt': startedAt!.toIso8601String()};
  static PendingRequest fromJson(Map<String, dynamic> j) => PendingRequest(
      PendingKind.values.byName(j['kind'] as String),
      DateTime.parse(j['startedAt'] as String));

  /// BTN-KILL-03·04 — 홈 안내 한 줄. 적어둔 시각을 넣는다.
  String get homeMessage => homeMessageAt(startedAt!);
  String homeMessageAt(DateTime at) {
    final label = kind == PendingKind.book ? '예약' : '예약 변경';
    return '${koreanTime(at)}에 신청하신 $label의 결과를 확인하지 못했습니다';
  }
}

const _kPendingKey = 'pending_request';

class PendingRequestStore {
  final FlutterSecureStorage _storage;
  PendingRequestStore(this._storage);

  /// BTN-KILL-01: 요청을 보내기 직전에 유언을 남긴다.
  Future<void> begin(PendingKind kind, DateTime at) => _storage.write(
      key: _kPendingKey, value: jsonEncode(PendingRequest(kind, at).toJson()));

  /// BTN-KILL-02: 응답이 도착하면 즉시 지운다.
  Future<void> complete() => _storage.delete(key: _kPendingKey);

  /// BTN-KILL-05: 안내를 확인하거나 닫으면 지운다.
  Future<void> dismiss() => _storage.delete(key: _kPendingKey);

  /// 앱을 다시 켰을 때 남아 있는 유언을 읽는다(BTN-KILL-03). 없으면 null.
  Future<PendingRequest?> read() async {
    final raw = await _storage.read(key: _kPendingKey);
    if (raw == null) return null;
    return PendingRequest.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }
}

final pendingRequestStoreProvider = Provider<PendingRequestStore>(
    (ref) => PendingRequestStore(const FlutterSecureStorage()));

/// 홈이 구독한다 — 앱을 다시 켰을 때 남은 유언을 읽어 카드로 그린다.
final pendingRequestProvider =
    FutureProvider<PendingRequest?>((ref) => ref.watch(pendingRequestStoreProvider).read());
