abstract class BackendApiClient {
  Future<Map<String, dynamic>> get(String path);
  Future<Map<String, dynamic>> post(String path, {Map<String, dynamic>? body});
  Future<Map<String, dynamic>> patch(String path, {Map<String, dynamic>? body});
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
