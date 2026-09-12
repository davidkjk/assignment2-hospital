import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/questionnaire/questionnaire_repository.dart';

/// 펼침 문진 표(QnrTable)가 questionnaireRepositoryProvider→apiClientProvider→
/// Supabase.instance.client 를 타서 위젯 테스트가 「supabase 미초기화」로 터지는 것을 막는다.
///
/// load가 완결되지 않는 Future라 표는 「문진 답변을 불러오는 중입니다」(로딩)에 머문다 —
/// 이 표를 렌더하는 테스트들이 검증하는 것은 펼침 표의 존재·자물쇠·수정 버튼 유무이지 실제
/// 문항 내용이 아니다(내용 렌더는 T23·24 소관). save는 이 테스트들이 부르지 않는다.
class FakeQnrRepo extends Fake implements QuestionnaireRepository {
  @override
  Future<QnrData> load(String appointmentId) => Completer<QnrData>().future;
}
