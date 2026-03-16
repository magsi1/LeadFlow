import 'package:firebase_auth/firebase_auth.dart';

import '../../models/app_user.dart';
import '../auth_repository.dart';

class FirebaseAuthRepository implements AuthRepository {
  FirebaseAuthRepository(this._auth);
  final FirebaseAuth _auth;

  @override
  Future<AppUser?> restoreSession() async {
    final user = _auth.currentUser;
    if (user == null) return null;
    return AppUser(
      id: user.uid,
      fullName: user.displayName ?? 'LeadFlow User',
      email: user.email ?? '',
      phone: user.phoneNumber ?? '',
      role: UserRole.salesperson,
      businessId: '',
      isActive: true,
      createdAt: DateTime.now(),
    );
  }

  @override
  Future<AppUser> signIn({required String email, required String password}) async {
    final credential = await _auth.signInWithEmailAndPassword(email: email, password: password);
    final user = credential.user!;
    return AppUser(
      id: user.uid,
      fullName: user.displayName ?? 'LeadFlow User',
      email: user.email ?? '',
      phone: user.phoneNumber ?? '',
      role: UserRole.salesperson,
      businessId: '',
      isActive: true,
      createdAt: DateTime.now(),
    );
  }

  @override
  Future<AppUser> signUp({
    required String fullName,
    required String email,
    required String password,
  }) async {
    final credential = await _auth.createUserWithEmailAndPassword(email: email, password: password);
    final user = credential.user!;
    await user.updateDisplayName(fullName);
    return AppUser(
      id: user.uid,
      fullName: fullName,
      email: user.email ?? email,
      phone: user.phoneNumber ?? '',
      role: UserRole.salesperson,
      businessId: '',
      isActive: true,
      createdAt: DateTime.now(),
    );
  }

  @override
  Future<void> signOut() => _auth.signOut();
}
