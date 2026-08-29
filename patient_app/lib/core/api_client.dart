import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiException implements Exception {
  ApiException(this.message);
  final String message;
  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({required this.baseUrl, required this.tokenProvider, http.Client? httpClient})
      : _client = httpClient ?? http.Client();
  final String baseUrl;
  final Future<String?> Function() tokenProvider;
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

  Future<T> delete<T>(String path, T Function(dynamic) parse) async =>
      _handle(await _client.delete(Uri.parse('$baseUrl$path'), headers: await _headers()), parse);

  T _handle<T>(http.Response response, T Function(dynamic) parse) {
    // 본문을 bodyBytes로 받아 utf-8로 직접 디코딩한다. FastAPI는 JSON에 charset을
    // 안 붙여, response.body에 맡기면 Latin1로 오독해 한글이 깨진다(갭 #14 메시지 포함).
    final text = response.bodyBytes.isEmpty ? '' : utf8.decode(response.bodyBytes);
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return parse(text.isEmpty ? null : jsonDecode(text));
    }
    var message = '요청 처리 중 오류가 발생했습니다.'; // 파이썬 예외 원문 대신 정형 한글(갭 #14)
    try {
      final body = jsonDecode(text);
      if (body is Map && body['detail'] is String) message = body['detail'] as String;
    } catch (_) {}
    throw ApiException(message);
  }
}
