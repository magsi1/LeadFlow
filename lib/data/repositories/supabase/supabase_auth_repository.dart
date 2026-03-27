import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/utils/supabase_signup_messages.dart';
import '../../models/app_user.dart';
import '../auth_repository.dart';

class SupabaseAuthRepository implements AuthRepository {
  SupabaseAuthRepository(this._client);
  final SupabaseClient _client;

  @override
  Future<AppUser?> restoreSession() async {
    final authUser = _client.auth.currentUser;
    if (authUser == null) return null;
    return _readProfile(authUser);
  }

  @override
  Future<AppUser> signIn({required String email, required String password}) async {
    final normalizedEmail = email.trim();
    final normalizedPassword = password.trim();
    try {
      // Validate that Supabase client is available before login.
      Supabase.instance.client;
      debugPrint('[LOGIN ATTEMPT] email=$normalizedEmail');
      final response = await _client.auth.signInWithPassword(
        email: normalizedEmail,
        password: normalizedPassword,
      );
      debugPrint('[LOGIN SUCCESS] user=${response.user?.email}');
      final authUser = response.user;
      if (authUser == null) {
        throw Exception('Unable to sign in');
      }
      return _readProfile(authUser);
    } catch (e) {
      debugPrint('[LOGIN ERROR FULL] $e');
      rethrow;
    }
  }

  @override
  Future<AppUser> signUp({
    required String fullName,
    required String email,
    required String password,
  }) async {
    final emailTrim = email.trim();
    final passwordTrim = password.trim();
    try {
      final response = await _client.auth.signUp(
        email: emailTrim,
        password: passwordTrim,
        data: {
          'full_name': fullName,
          'role': 'sales',
        },
      );
      // ignore: avoid_print — requested signup diagnostics
      print('Signup response: $response');
      debugPrint('Signup response: $response');

      final authUser = response.user;
      if (authUser == null) {
        throw SignupFailure('Unable to create account. Please try again.');
      }

      try {
        await _client.from('profiles').upsert({
          'id': authUser.id,
          'full_name': fullName,
          'email': authUser.email ?? emailTrim,
          'role': 'sales',
          'updated_at': DateTime.now().toIso8601String(),
        });
      } catch (e) {
        debugPrint('[Signup profile upsert] deferred or failed (e.g. email confirm): $e');
      }
      return _readProfile(authUser);
    } on AuthException catch (e) {
      debugPrint('Signup auth error: ${e.message}');
      throw SignupFailure(friendlySignupAuthMessage(e));
    }
  }

  @override
  Future<void> signOut() async {
    await _client.auth.signOut();
  }

  Future<AppUser> _readProfile(User authUser) async {
    final profile = await _client
        .from('profiles')
        .select()
        .eq('id', authUser.id)
        .maybeSingle();
    if (profile is Map<String, dynamic>) {
      final roleRaw = profile['role']?.toString() ?? 'sales';
      return AppUser(
        id: authUser.id,
        fullName: profile['full_name']?.toString() ?? authUser.email ?? 'LeadFlow User',
        email: profile['email']?.toString() ?? authUser.email ?? '',
        phone: '',
        role: _roleFrom(roleRaw),
        businessId: '',
        isActive: true,
        createdAt: DateTime.tryParse(profile['created_at']?.toString() ?? '') ?? DateTime.now(),
      );
    }
    return AppUser(
      id: authUser.id,
      fullName: authUser.email ?? 'LeadFlow User',
      email: authUser.email ?? '',
      phone: '',
      role: UserRole.salesperson,
      businessId: '',
      isActive: true,
      createdAt: DateTime.now(),
    );
  }

  UserRole _roleFrom(String? raw) {
    return switch (raw) {
      'owner' => UserRole.owner,
      'admin' => UserRole.admin,
      'manager' => UserRole.manager,
      'sales' || 'salesperson' => UserRole.salesperson,
      _ => UserRole.salesperson,
    };
  }
}
