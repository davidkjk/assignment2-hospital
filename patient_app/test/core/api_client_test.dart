import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  // 한글 본문은 utf-8 바이트로 돌려준다(http.Response는 문자열 본문을 Latin1로 인코딩해 한글에서 깨진다).
  http.Response jsonResponse(Object body, int status) =>
      http.Response.bytes(utf8.encode(jsonEncode(body)), status,
          headers: {'content-type': 'application/json; charset=utf-8'});

  test('성공 응답을 파싱해서 반환한다', () async {
    final mock = MockClient((r) async => jsonResponse({'appointment_id': 'a1'}, 200));
    final client = ApiClient(baseUrl: 'http://localhost:8000', tokenProvider: () async => 'tk', httpClient: mock);
    final result = await client.post('/bookings', {'reason': '감기'}, (j) => j['appointment_id'] as String);
    expect(result, 'a1');
  });
  test('실패 응답이면 한글 detail을 담은 ApiException을 던진다(예외 원문 노출 금지)', () async {
    final mock = MockClient((r) async => jsonResponse({'detail': '이미 선택된 시간입니다.'}, 409));
    final client = ApiClient(baseUrl: 'http://localhost:8000', tokenProvider: () async => 'tk', httpClient: mock);
    await expectLater(
      client.post('/bookings', {}, (j) => j),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', '이미 선택된 시간입니다.')),
    );
  });
}
