import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode, this.context, this.retryAfterSeconds}); // statusCode 추가(T0 누락 보강)
  final String message;
  final int? statusCode; // 403(프로필 미완료) 등 상태 구분용
  // 서버가 화면에 「갈 길」을 그리라고 준 구조화 데이터(errors.py app_error_handler의 content["context"]).
  // 예: 가족 연결 해제 차단(409)이 함께 주는 다가오는 예약 정보(FAM-UNLINK-03). Task 25가 첫 소비처.
  final Map<String, dynamic>? context;
  // 갭 #16 — 재발송 쿨다운을 서버가 정한다(429 + retry_after_seconds). 앱은 이 값으로 「N초 뒤
  // 다시 받기」 카운트를 맞춘다(환자앱 T26 가족 연결 OTP가 첫 소비처). null이면 기존 호출부 영향 없음.
  final int? retryAfterSeconds;
  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({required this.baseUrl, required this.tokenProvider, this.onUnauthorized,
      http.Client? httpClient})
      : _client = httpClient ?? http.Client();
  final String baseUrl;
  final Future<String?> Function() tokenProvider;
  // 401을 받으면 부른다 — 오프라인/온라인 판정은 session_guard.handleUnauthorized가 한다(갭 #38).
  final void Function()? onUnauthorized;
  final http.Client _client;

  Future<Map<String, String>> _headers() async {
    final token = await tokenProvider();
    return {'Content-Type': 'application/json', if (token != null) 'Authorization': 'Bearer $token'};
  }

  Future<T> get<T>(String path, T Function(dynamic) parse, {Map<String, String>? query}) async {
    final uri = Uri.parse('$baseUrl$path').replace(queryParameters: query);
    return _handle(await _client.get(uri, headers: await _headers()), parse);
  }

  Future<T> post<T>(String path, Map<String, dynamic> body, T Function(dynamic) parse) async => _handle(
      await _client.post(Uri.parse('$baseUrl$path'), headers: await _headers(), body: jsonEncode(body)), parse);

  Future<T> patch<T>(String path, Map<String, dynamic> body, T Function(dynamic) parse) async => _handle(
      await _client.patch(Uri.parse('$baseUrl$path'), headers: await _headers(), body: jsonEncode(body)), parse);

  Future<T> delete<T>(String path, T Function(dynamic) parse, {Map<String, dynamic>? body}) async =>
      _handle(await _client.delete(Uri.parse('$baseUrl$path'), headers: await _headers(),
          body: body == null ? null : jsonEncode(body)), parse);

  T _handle<T>(http.Response response, T Function(dynamic) parse) {
    // 본문을 bodyBytes로 받아 utf-8로 직접 디코딩한다. FastAPI는 JSON에 charset을
    // 안 붙여, response.body에 맡기면 Latin1로 오독해 한글이 깨진다(갭 #14 메시지 포함).
    final text = response.bodyBytes.isEmpty ? '' : utf8.decode(response.bodyBytes);
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return parse(text.isEmpty ? null : jsonDecode(text));
    }
    if (response.statusCode == 401) onUnauthorized?.call(); // 오프라인/온라인 판정은 session_guard가 한다
    var message = '요청 처리 중 오류가 발생했습니다.'; // 파이썬 예외 원문 대신 정형 한글(갭 #14)
    Map<String, dynamic>? context;
    int? retryAfter;
    try {
      final body = jsonDecode(text);
      if (body is Map && body['detail'] is String) message = body['detail'] as String;
      if (body is Map && body['context'] is Map) {
        context = Map<String, dynamic>.from(body['context'] as Map); // FAM-UNLINK-03 등 구조화 데이터
      }
      if (body is Map && body['retry_after_seconds'] is int) {
        retryAfter = body['retry_after_seconds'] as int; // 갭 #16 — OTP 재발송 429 남은 초
      }
    } catch (_) {}
    throw ApiException(message,
        statusCode: response.statusCode, context: context, retryAfterSeconds: retryAfter);
  }
}
