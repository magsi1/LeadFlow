import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/utils/iterable_extensions.dart';
import '../../models/app_user.dart';
import '../../services/mock_seed_service.dart';
import '../auth_repository.dart';

class MockAuthRepository implements AuthRepository {
  static const _sessionKey = 'leadflow_session_user';
  final List<AppUser> _users = MockSeedService.users();

  @override
  Future<AppUser?> restoreSession() async {
    final prefs = await SharedPreferences.getInstance();
    final userId = prefs.getString(_sessionKey);
    if (userId == null) return null;
    return _users.where((e) => e.id == userId).cast<AppUser?>().firstOrNull;
  }

  @override
  Future<AppUser> signIn({required String email, required String password}) async {
    if (password != '123456') {
      throw Exception('Invalid credentials.');
    }
    final user = _users.where((e) => e.email.toLowerCase() == email.toLowerCase()).firstOrNull;
    if (user == null) {
      throw Exception('No account found for this email.');
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_sessionKey, user.id);
    return user;
  }

  @override
  Future<void> signOut() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_sessionKey);
  }
}
