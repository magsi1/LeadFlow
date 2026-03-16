import '../models/app_user.dart';

abstract class AuthRepository {
  Future<AppUser?> restoreSession();
  Future<AppUser> signIn({required String email, required String password});
  Future<void> signOut();
}
