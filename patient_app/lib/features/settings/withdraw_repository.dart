import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/providers.dart';

/// 탈퇴를 막는 다가오는 예약 한 줄(내 것 + ㉮ 가족). 서버 list_withdrawal_blocks()가 판정해 준다.
class WithdrawBlock {
  const WithdrawBlock({
    required this.patientName,
    required this.department,
    required this.slotDate,
    required this.startTime,
    required this.isFamily,
  });
  final String patientName, department, slotDate, startTime;
  final bool isFamily;

  factory WithdrawBlock.fromJson(Map<String, dynamic> j) => WithdrawBlock(
        patientName: j['patient_name'] as String,
        department: j['department'] as String,
        slotDate: j['slot_date'] as String,
        startTime: (j['start_time'] as String).substring(0, 5), // HH:MM
        isFamily: j['is_family'] == true,
      );
}

class WithdrawRepository {
  WithdrawRepository(this._api);
  final ApiClient _api;

  Future<List<WithdrawBlock>> blocks() => _api.get(
      '/me/withdrawal-blocks',
      (j) => [for (final b in (j as List)) WithdrawBlock.fromJson(Map<String, dynamic>.from(b as Map))]);

  Future<void> deactivate() => _api.post('/me/deactivate', const {}, (_) {}); // [SET-QUIT-19]
}

final withdrawRepositoryProvider =
    Provider<WithdrawRepository>((ref) => WithdrawRepository(ref.watch(apiClientProvider)));

final withdrawBlocksProvider = FutureProvider<List<WithdrawBlock>>(
    (ref) => ref.watch(withdrawRepositoryProvider).blocks());
