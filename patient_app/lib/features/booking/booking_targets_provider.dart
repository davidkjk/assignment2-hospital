import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/providers.dart'; // apiClientProvider
import 'booking_controller.dart';

// 예약 대상 = 본인 + 가족. 본인 맨 위(BOOK-WHO-01).
// ⚠️ 병렬 트랙(가족 기능=세션 B)과의 결합을 피하려고 FamilyRepository에 의존하지 않고
//    기존 백엔드 엔드포인트를 직접 부른다: GET /patient/me(본인) + GET /family(가족).
//    세션 B 머지 후에도 그대로 동작한다(같은 엔드포인트).
final bookingTargetsProvider = FutureProvider.autoDispose<List<BookingTarget>>((ref) async {
  final api = ref.read(apiClientProvider);
  final me = await api.get('/patient/me', (j) => j as Map<String, dynamic>);
  final family = await api.get('/family', (j) => (j as List).cast<Map<String, dynamic>>());
  return [
    BookingTarget(me['id'] as String, me['name'] as String, null), // BOOK-WHO-02 본인도 실제 UUID('self' 금지)
    for (final f in family)
      BookingTarget(f['id'] as String, f['name'] as String, f['relation'] as String?),
  ];
});
