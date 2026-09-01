import 'package:flutter/material.dart';
import '../../core/tokens.dart';

/// 예약 중 상담(제한모드, 결정 E4). 정보성 안내·진료과 추천만 하고 모든 행동형 카드를 금지한다(MODE,
/// Task 6 restricted_mode.ALLOWED_CARD_TYPES_RESTRICTED = 공집합). 119·응급실 긴급 안내는 모드와
/// 무관하게 항상 작동한다(BLOCK). 예약 대상 맥락을 갖고 다시 묻지 않으며(CONTEXT), 유일한 행동 출구는
/// [○○과로 계속하기](DONE). 환자앱 T20 DeptBotSheet 안에 이 엔진이 주입된다(OPEN/CLOSE는 시트가 소유).
class RestrictedModeError implements Exception {
  final String cardType;
  RestrictedModeError(this.cardType);
  @override
  String toString() => 'RestrictedModeError($cardType)';
}

/// 제한모드에선 어떤 행동형 카드도 낼 수 없다 — 무엇이 오든 막는다(허용 집합=공집합).
void assertActionCardBlocked(String cardType) {
  throw RestrictedModeError(cardType);
}

/// 119·응급실 긴급 안내는 제한모드에서도 항상 허용된다(정본 §4).
bool isEmergencyAllowedInRestricted() => true;

class RestrictedChatController {
  final String forPatientId, relation;
  RestrictedChatController({required this.forPatientId, required this.relation});

  /// 예약 대상 UUID·관계를 상담 엔진에 전달한다(다시 묻지 않게 — CONTEXT).
  Map<String, dynamic> get context =>
      {'for_patient_id': forPatientId, 'relation': relation};
}

/// 제한모드 대화 패널. DeptBotSheet(T20)의 시트 chrome(헤더·닫기·계속) 안에 주입되는 대화 엔진 표면.
class RestrictedChatPanel extends StatelessWidget {
  /// 겹침 시트 내용임을 표시한다(BOOKBOT-SHEET-OPEN-01) — 화면을 떠나지 않는다.
  static const bool isOverlaySheetContent = true;

  final String forPatientId, relation;
  final bool loading, errored;
  final String? suggestedDept;
  final void Function(String dept)? onContinueToDept;
  final VoidCallback? onClose;
  const RestrictedChatPanel({
    super.key,
    required this.forPatientId,
    required this.relation,
    this.loading = false,
    this.errored = false,
    this.suggestedDept,
    this.onContinueToDept,
    this.onClose,
  });

  @override
  Widget build(BuildContext context) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Align(
            alignment: Alignment.centerRight,
            child: IconButton(
              key: const Key('sheet-close'),
              icon: const Icon(Icons.close),
              onPressed: onClose,
            ),
          ),
          const Text('진단이 아니라 알맞은 진료과를 안내합니다'), // INIT: 진단 아님 유지
          if (loading)
            const Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (errored) ...[
            const Text('답변을 불러오지 못했어요'),
            TextButton(onPressed: () {}, child: const Text('다시 시도')),
          ],
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: TextField(
              decoration: InputDecoration(hintText: '증상을 입력하세요'),
            ), // 자유 입력은 항상 유지(로딩·오류에도)
          ),
          if (suggestedDept != null)
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: AppTokens.primary),
              onPressed: () => onContinueToDept?.call(suggestedDept!),
              child: Text('$suggestedDept로 계속하기'), // DONE: 유일 행동 출구
            ),
        ],
      );
}
