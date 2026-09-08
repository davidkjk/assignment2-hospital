import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api_client.dart'; // ApiClient
import '../../../core/providers.dart'; // apiClientProvider
import '../catalog_repository.dart'; // Department

/// POST /chat/dept-guide 응답(제한모드 진료과 추천, 결정 E4).
/// 서버는 세션을 만들지 않고 {reply, suggested_department:{id,name}|null, emergency} 만 준다.
class DeptGuideResult {
  final String reply; // 봇 말풍선 본문(질문 또는 추천)
  final Department? suggested; // 추천 진료과(있으면 "○○과로 계속하기"). 없으면 null(아직 문진 중)
  final bool emergency; // 119 안전 안내(제한모드여도 항상 작동)
  const DeptGuideResult({required this.reply, this.suggested, this.emergency = false});
}

/// 테스트가 가짜를 주입하기 위한 최소 계약.
abstract class DeptGuideRepositoryLike {
  Future<DeptGuideResult> guide({
    required String message,
    required List<String> history, // 이전 환자 발화들(시간순) — 서버 무상태 계약
    String relation,
  });
}

class DeptGuideRepository implements DeptGuideRepositoryLike {
  final ApiClient _api;
  DeptGuideRepository(this._api);

  @override
  Future<DeptGuideResult> guide({
    required String message,
    required List<String> history,
    String relation = '본인',
  }) =>
      _api.post(
        '/chat/dept-guide',
        {'message': message, 'history': history, 'relation': relation},
        (j) {
          final m = j as Map<String, dynamic>;
          final sd = m['suggested_department'];
          return DeptGuideResult(
            reply: (m['reply'] as String?) ?? '',
            suggested: (sd is Map && sd['id'] is String && sd['name'] is String)
                ? Department(sd['id'] as String, sd['name'] as String)
                : null,
            emergency: m['emergency'] == true,
          );
        },
      );
}

final deptGuideRepositoryProvider = Provider<DeptGuideRepositoryLike>(
    (ref) => DeptGuideRepository(ref.read(apiClientProvider)));
