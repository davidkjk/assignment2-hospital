import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/router.dart';

void main() {
  test('appRouter는 /landing을 초기 경로로 갖는다 (#40 랜딩=로그인+회원가입 입구)', () {
    expect(appRouter.routeInformationProvider.value.uri.toString(), '/landing');
  });
}
