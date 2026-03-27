import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import '../errors/app_exception.dart';

/// Unwraps LeadFlow REST `{ "ok": true, "data": ... }`.
///
/// With `package:http`, `jsonDecode(response.body)` matches axios **`response.data`**;
/// the inner payload is **`response.data.data`** in JS — in Dart use **`decoded['data']`**
/// or [LeadflowApiEnvelope] below.
class LeadflowApiEnvelope {
  LeadflowApiEnvelope._();

  static void ensureOk(Map<String, dynamic> decoded) {
    if (decoded['ok'] == true) return;
    final err = decoded['error']?.toString() ?? 'Request failed';
    throw AppException(err, code: 'LEADFLOW_API');
  }

  /// Expects `data` to be a JSON array.
  static List<dynamic> expectDataList(Map<String, dynamic> decoded) {
    ensureOk(decoded);
    final data = decoded['data'];
    if (data is! List) return <dynamic>[];
    return data;
  }

  /// Expects `data` to be a JSON object.
  static Map<String, dynamic>? expectDataMap(Map<String, dynamic> decoded) {
    ensureOk(decoded);
    final data = decoded['data'];
    if (data is Map) {
      return Map<String, dynamic>.from(data);
    }
    return null;
  }
}

abstract class BackendApiClient {
  Future<Map<String, dynamic>> get(String path);
  Future<Map<String, dynamic>> post(String path, {Map<String, dynamic>? body});
  Future<Map<String, dynamic>> patch(String path, {Map<String, dynamic>? body});
}

class HttpBackendApiClient implements BackendApiClient {
  HttpBackendApiClient({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  Uri _uri(String path) {
    final normalizedPath = path.startsWith('/') ? path : '/$path';
    return Uri.parse('${AppConfig.backendBaseUrl}$normalizedPath');
  }

  Map<String, String> _headers() {
    return {
      'Content-Type': 'application/json',
      if (AppConfig.authToken.isNotEmpty) 'Authorization': 'Bearer ${AppConfig.authToken}',
    };
  }

  Map<String, dynamic> _decode(http.Response response) {
    if (response.body.isEmpty) return {'ok': response.statusCode >= 200 && response.statusCode < 300};
    final dynamic decoded = jsonDecode(response.body);
    if (decoded is Map<String, dynamic>) return decoded;
    return {'data': decoded};
  }

  void _ensureSuccess(http.Response response) {
    if (response.statusCode >= 200 && response.statusCode < 300) return;
    throw AppException('Backend request failed', code: 'HTTP_${response.statusCode}');
  }

  @override
  Future<Map<String, dynamic>> get(String path) async {
    final response = await _client.get(_uri(path), headers: _headers());
    _ensureSuccess(response);
    return _decode(response);
  }

  @override
  Future<Map<String, dynamic>> patch(String path, {Map<String, dynamic>? body}) async {
    final response = await _client.patch(
      _uri(path),
      headers: _headers(),
      body: jsonEncode(body ?? const {}),
    );
    _ensureSuccess(response);
    return _decode(response);
  }

  @override
  Future<Map<String, dynamic>> post(String path, {Map<String, dynamic>? body}) async {
    final response = await _client.post(
      _uri(path),
      headers: _headers(),
      body: jsonEncode(body ?? const {}),
    );
    _ensureSuccess(response);
    return _decode(response);
  }
}

class MockBackendApiClient implements BackendApiClient {
  @override
  Future<Map<String, dynamic>> get(String path) async {
    return {'path': path, 'ok': true};
  }

  @override
  Future<Map<String, dynamic>> patch(String path, {Map<String, dynamic>? body}) async {
    return {'path': path, 'body': body ?? {}, 'ok': true};
  }

  @override
  Future<Map<String, dynamic>> post(String path, {Map<String, dynamic>? body}) async {
    return {'path': path, 'body': body ?? {}, 'ok': true};
  }
}
