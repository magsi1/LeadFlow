import '../../models/app_user.dart';
import '../../../core/network/backend_api_client.dart';
import '../auth_repository.dart';

class RemoteAuthRepository implements AuthRepository {
  RemoteAuthRepository(this._apiClient);
  final BackendApiClient _apiClient;

  @override
  Future<AppUser?> restoreSession() async {
    final response = await _apiClient.get('/api/auth/session');
    final user = response['user'];
    if (user is! Map<String, dynamic>) return null;
    return AppUser.fromMap(user);
  }

  @override
  Future<AppUser> signIn({required String email, required String password}) async {
    final response = await _apiClient.post(
      '/api/auth/login',
      body: {
        'email': email,
        'password': password,
      },
    );
    final user = response['user'];
    if (user is Map<String, dynamic>) return AppUser.fromMap(user);
    throw Exception('Invalid auth response');
  }

  @override
  Future<AppUser> signUp({
    required String fullName,
    required String email,
    required String password,
  }) async {
    final response = await _apiClient.post(
      '/api/auth/signup',
      body: {
        'fullName': fullName,
        'email': email,
        'password': password,
      },
    );
    final user = response['user'];
    if (user is Map<String, dynamic>) return AppUser.fromMap(user);
    return signIn(email: email, password: password);
  }

  @override
  Future<void> signOut() async {
    await _apiClient.post('/api/auth/logout');
  }
}
