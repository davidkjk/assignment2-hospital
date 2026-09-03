import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/tokens.dart';

void main() {
  // 규칙이 못박은 값(색 16진수·높이·바 폭)을 그대로 확인한다.
  test('[DISP-GRAY-01] 대기(아직 안 된 일) 회색 = #454545 (중립 + 사용자 요청으로 더 진하게)', () {
    expect(AppTokens.grayPending.toARGB32(), 0xFF454545);
  });
  test('[DISP-GRAY-02] 완료·취소(이미 끝난 일) 회색 = #A3AFB8', () {
    expect(AppTokens.grayDone.toARGB32(), 0xFFA3AFB8);
  });
  test('[DISP-GRAY-03] 회색은 두 진하기뿐 — 새 색을 만들지 않는다', () {
    // 같은 계열 안에서 진하기만 가른다: 회색 토큰은 정확히 grayPending·grayDone 2개.
    expect(AppTokens.grays, [AppTokens.grayPending, AppTokens.grayDone]);
  });
  test('[DISP-CARD-01] 카드 본문 높이 = 132px 고정', () {
    expect(AppTokens.cardBodyHeight, 132.0);
  });
  test('[DISP-WARN-01] 주의 표시 좌측 바 폭 = 4px', () {
    expect(AppTokens.warnBarWidth, 4.0);
  });
}
