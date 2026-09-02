import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/providers.dart'; // apiClientProvider
import 'booking_controller.dart';

// 예약 대상 = 본인 + 가족. 본인 맨 위(BOOK-WHO-01).
// ⚠️ GET /family(list_family_members)가 이미 **본인(맨 위·relation '본인'·실제 UUID) + 활성 가족**을
//    함께 준다(WHERE p.id=본인 or 활성 링크, ORDER BY 본인 먼저). 따라서 /patient/me로 본인을 또
//    붙이면 화면에 이름이 두 번 뜬다(2026-09-02 사용자 발견) → /family 하나만 쓴다.
//    BOOK-WHO-02(본인도 실제 UUID) 충족: 본인 항목의 id는 p.id(UUID). 세션 B 머지 후에도 동일 동작.
final bookingTargetsProvider = FutureProvider.autoDispose<List<BookingTarget>>((ref) async {
  final api = ref.read(apiClientProvider);
  final family = await api.get('/family', (j) => (j as List).cast<Map<String, dynamic>>());
  return [
    for (final f in family)
      BookingTarget(f['id'] as String, f['name'] as String, f['relation'] as String?),
  ];
});
